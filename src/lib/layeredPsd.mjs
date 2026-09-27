import sharp from "sharp";
import { writePsdBuffer } from "ag-psd";
import { svgPathBbox } from "svg-path-bbox";
import svgpath from "svgpath";

const DEFAULT_LONG_EDGE = 4096;
const MAX_CANVAS_PIXELS = 20_000_000;
const MAX_PSD_BYTES = 256 * 1024 * 1024;
const MAX_OBJECT_LAYERS = 4096;
const RENDER_CONCURRENCY = 4;
const COMPLEX_RENDER_CONCURRENCY = 2;
const COMPLEX_SVG_OBJECT_THRESHOLD = 500;
const MICRO_DETAIL_AREA_RATIO = 0.0005;
const MICRO_DETAIL_SPAN_RATIO = 0.08;
const MICRO_DETAIL_BATCH_SIZE = 96;
const MAX_VECTOR_SHAPE_LAYERS = 384;

const LAYER_NAMES = {
  background: "Background",
  stripe: "Stripes",
  pattern: "Patterns",
  sleeve: "Sleeves",
  collar: "Collar",
  border: "Borders",
  logo: "Logos",
  number: "Numbers",
  text: "Text",
  other: "Other",
  artwork: "Artwork",
};

function decodeXmlAttribute(value) {
  return String(value || "")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function readAttribute(tag, name) {
  const escapedName = name.replace(":", "\\:");
  const match = tag.match(new RegExp(`\\b${escapedName}\\s*=\\s*(["'])(.*?)\\1`, "i"));
  return match ? decodeXmlAttribute(match[2]) : null;
}

function semanticLabelFromTag(tag) {
  const dataLayer = readAttribute(tag, "data-layer");
  const id = readAttribute(tag, "id");
  const raw = dataLayer || (id?.toLowerCase().startsWith("layer-") ? id.slice(6) : null);
  if (!raw) return null;
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 64) || "other";
}

export function assertSafeSvg(svgText) {
  const svg = String(svgText || "");
  if (!/<svg\b/i.test(svg) || !/<\/svg\s*>/i.test(svg)) {
    throw new Error("The vector file is not a valid SVG document.");
  }

  if (/<(?:script|foreignObject|iframe|object|embed)\b/i.test(svg) || /<!DOCTYPE|<!ENTITY/i.test(svg)) {
    throw new Error("The vector file contains unsupported active content.");
  }

  const hrefPattern = /\b(?:href|xlink:href)\s*=\s*(["'])(.*?)\1/gi;
  let hrefMatch;
  while ((hrefMatch = hrefPattern.exec(svg)) !== null) {
    const href = decodeXmlAttribute(hrefMatch[2]).trim();
    if (href && !href.startsWith("#")) {
      throw new Error("The vector file contains an external asset reference.");
    }
  }

  if (/url\(\s*["']?\s*(?:https?:|file:|\/\/)/i.test(svg)) {
    throw new Error("The vector file contains an external style reference.");
  }

  return svg;
}

function svgRoot(svgText) {
  const openMatch = svgText.match(/<svg\b[^>]*>/i);
  const closeIndex = svgText.toLowerCase().lastIndexOf("</svg");
  if (!openMatch || closeIndex < 0) throw new Error("The SVG root element is incomplete.");
  const innerStart = (openMatch.index || 0) + openMatch[0].length;
  return {
    openTag: openMatch[0],
    inner: svgText.slice(innerStart, closeIndex),
  };
}

function sharedSvgBlocks(inner) {
  const blocks = [];
  const pattern = /<(defs|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  let match;
  while ((match = pattern.exec(inner)) !== null) blocks.push(match[0]);
  return blocks.join("\n");
}

export function extractSemanticSvgLayers(svgText) {
  const safeSvg = assertSafeSvg(svgText);
  const { inner } = svgRoot(safeSvg);
  const tokenPattern = /<g\b[^>]*>|<\/g\s*>/gi;
  const stack = [];
  const layers = [];
  let token;

  while ((token = tokenPattern.exec(inner)) !== null) {
    if (/^<\/g/i.test(token[0])) {
      const opened = stack.pop();
      if (opened?.label) {
        layers.push({
          label: opened.label,
          markup: inner.slice(opened.start, tokenPattern.lastIndex),
          sourceIndex: opened.start,
        });
      }
      continue;
    }

    stack.push({
      start: token.index,
      label: semanticLabelFromTag(token[0]),
    });
  }

  if (layers.length > 0) {
    return layers.sort((a, b) => a.sourceIndex - b.sourceIndex);
  }

  const fallbackMarkup = inner.replace(/<(defs|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "").trim();
  if (!fallbackMarkup) throw new Error("The SVG does not contain renderable artwork.");
  return [{ label: "artwork", markup: fallbackMarkup, sourceIndex: 0 }];
}

function numericLength(value) {
  const number = Number.parseFloat(String(value || "").replace(/px$/i, ""));
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function resolvePsdCanvasSize(svgText, longEdge = DEFAULT_LONG_EDGE) {
  const { openTag } = svgRoot(assertSafeSvg(svgText));
  const viewBox = readAttribute(openTag, "viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewWidth = viewBox?.length === 4 && viewBox[2] > 0 ? viewBox[2] : null;
  const viewHeight = viewBox?.length === 4 && viewBox[3] > 0 ? viewBox[3] : null;
  const sourceWidth = viewWidth || numericLength(readAttribute(openTag, "width")) || 1024;
  const sourceHeight = viewHeight || numericLength(readAttribute(openTag, "height")) || 1024;
  const safeLongEdge = Math.max(512, Math.min(8192, Math.round(longEdge || DEFAULT_LONG_EDGE)));
  const scale = safeLongEdge / Math.max(sourceWidth, sourceHeight);
  let width = Math.max(1, Math.round(sourceWidth * scale));
  let height = Math.max(1, Math.round(sourceHeight * scale));

  if (width * height > MAX_CANVAS_PIXELS) {
    const pixelScale = Math.sqrt(MAX_CANVAS_PIXELS / (width * height));
    width = Math.max(1, Math.floor(width * pixelScale));
    height = Math.max(1, Math.floor(height * pixelScale));
  }

  return { width, height };
}

function isolatedSvg(svgText, markup) {
  const { openTag, inner } = svgRoot(svgText);
  const shared = sharedSvgBlocks(inner);
  return `${openTag}${shared ? `\n${shared}` : ""}\n${markup}\n</svg>`;
}

const RENDERABLE_ELEMENTS = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "use",
  "image",
]);
const NON_ARTWORK_CONTAINERS = new Set([
  "defs",
  "style",
  "clippath",
  "mask",
  "pattern",
  "marker",
  "symbol",
]);

export function extractLeafSvgObjects(markup) {
  const objects = [];
  const stack = [];
  const tokenPattern = /<!--[\s\S]*?-->|<[^>]+>/g;
  let token;

  while ((token = tokenPattern.exec(markup)) !== null) {
    const tag = token[0];
    if (/^<!--|^<\?|^<!/i.test(tag)) continue;

    const close = tag.match(/^<\s*\/\s*([a-z][\w:.-]*)/i);
    if (close) {
      const opened = stack.pop();
      if (opened?.capture && opened.name === close[1].toLowerCase()) {
        const elementMarkup = markup.slice(opened.start, tokenPattern.lastIndex);
        const wrapperClose = [...opened.wrappers]
          .reverse()
          .map((wrapper) => `</${wrapper.name}>`)
          .join("");
        objects.push({
          tagName: opened.name,
          elementTag: opened.openTag,
          markup: `${opened.wrappers.map((wrapper) => wrapper.openTag).join("")}${elementMarkup}${wrapperClose}`,
          sourceIndex: opened.start,
        });
      }
      continue;
    }

    const open = tag.match(/^<\s*([a-z][\w:.-]*)/i);
    if (!open) continue;
    const name = open[1].toLowerCase();
    const selfClosing = /\/\s*>$/.test(tag);
    const suppressed = stack.some((entry) => entry.suppressed || entry.capture)
      || NON_ARTWORK_CONTAINERS.has(name);
    const wrappers = stack
      .filter((entry) => !entry.capture && !entry.suppressed)
      .map((entry) => ({ name: entry.name, openTag: entry.openTag }));

    if (RENDERABLE_ELEMENTS.has(name) && !suppressed) {
      if (selfClosing) {
        const wrapperClose = [...wrappers].reverse().map((wrapper) => `</${wrapper.name}>`).join("");
        objects.push({
          tagName: name,
          elementTag: tag,
          markup: `${wrappers.map((wrapper) => wrapper.openTag).join("")}${tag}${wrapperClose}`,
          sourceIndex: token.index,
        });
      } else {
        stack.push({ name, openTag: tag, start: token.index, capture: true, suppressed: false, wrappers });
      }
      continue;
    }

    if (!selfClosing) {
      stack.push({ name, openTag: tag, start: token.index, capture: false, suppressed });
    }
  }

  return objects.sort((a, b) => a.sourceIndex - b.sourceIndex);
}

function rootGeometry(svgText) {
  const { openTag } = svgRoot(svgText);
  const viewBox = readAttribute(openTag, "viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { x: viewBox[0], y: viewBox[1], width: viewBox[2], height: viewBox[3] };
  }
  return {
    x: 0,
    y: 0,
    width: numericLength(readAttribute(openTag, "width")) || 1024,
    height: numericLength(readAttribute(openTag, "height")) || 1024,
  };
}

function pathBounds(object) {
  if (Array.isArray(object.bounds) && object.bounds.length === 4) return object.bounds;
  if (object.tagName !== "path") return null;
  const d = readAttribute(object.elementTag, "d");
  if (!d) return null;

  if (!hasOnlyIdentityTransforms(object.markup)) return null;

  try {
    const bounds = svgPathBbox(d);
    return bounds.every(Number.isFinite) ? bounds : null;
  } catch {
    return null;
  }
}

function hasOnlyIdentityTransforms(markup) {
  if (/\btransform\s*:/i.test(String(markup || ""))) return false;
  const transforms = [...String(markup || "").matchAll(/\btransform\s*=\s*(["'])(.*?)\1/gi)]
    .map((match) => match[2].trim())
    .filter(Boolean);
  return transforms.every((transform) => {
    const translate = transform.match(/^translate\(\s*([+-]?(?:\d*\.)?\d+)\s*(?:[,\s]\s*([+-]?(?:\d*\.)?\d+))?\s*\)$/i);
    return translate && Number(translate[1]) === 0 && Number(translate[2] || 0) === 0;
  });
}

function presentationValues(markup, name) {
  const values = [];
  for (const match of String(markup || "").matchAll(/<\s*[a-z][^>]*>/gi)) {
    const tag = match[0];
    const attribute = readAttribute(tag, name);
    if (attribute !== null) values.push(attribute.trim());
    const style = readAttribute(tag, "style");
    if (style) {
      const declaration = style
        .split(";")
        .map((entry) => entry.split(":"))
        .find(([property]) => property?.trim().toLowerCase() === name.toLowerCase());
      if (declaration?.length > 1) values.push(declaration.slice(1).join(":").trim());
    }
  }
  return values;
}

function presentationValue(markup, name) {
  return presentationValues(markup, name).at(-1) ?? null;
}

function parseSolidColor(value) {
  const color = String(value || "#000000").trim().toLowerCase();
  if (!color || color === "none" || color === "transparent" || color.includes("url(")) return null;
  const named = {
    black: "#000000",
    white: "#ffffff",
    red: "#ff0000",
    green: "#008000",
    blue: "#0000ff",
    yellow: "#ffff00",
    cyan: "#00ffff",
    magenta: "#ff00ff",
    gray: "#808080",
    grey: "#808080",
  };
  const resolved = named[color] || color;
  const shortHex = resolved.match(/^#([0-9a-f]{3})$/i);
  if (shortHex) {
    const [r, g, b] = shortHex[1].split("").map((digit) => Number.parseInt(digit + digit, 16));
    return { r, g, b };
  }
  const hex = resolved.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    return {
      r: Number.parseInt(hex[1].slice(0, 2), 16),
      g: Number.parseInt(hex[1].slice(2, 4), 16),
      b: Number.parseInt(hex[1].slice(4, 6), 16),
    };
  }
  const rgb = resolved.match(/^rgba?\(\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?\s*[, ]\s*([\d.]+)%?(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/i);
  if (!rgb || rgb[4] && Number.parseFloat(rgb[4]) !== 1 && rgb[4] !== "100") return null;
  const percentages = resolved.includes("%");
  const channels = rgb.slice(1, 4).map((channel) => {
    const number = Number.parseFloat(channel);
    return Math.round(Math.max(0, Math.min(percentages ? 100 : 255, number)) * (percentages ? 2.55 : 1));
  });
  return { r: channels[0], g: channels[1], b: channels[2] };
}

function numberAttribute(tag, name, fallback = 0) {
  const value = Number.parseFloat(readAttribute(tag, name));
  return Number.isFinite(value) ? value : fallback;
}

function objectPathData(object) {
  const tag = object.elementTag;
  if (object.tagName === "path") return readAttribute(tag, "d");
  if (object.tagName === "rect") {
    const x = numberAttribute(tag, "x");
    const y = numberAttribute(tag, "y");
    const width = numberAttribute(tag, "width");
    const height = numberAttribute(tag, "height");
    if (width <= 0 || height <= 0 || numberAttribute(tag, "rx") || numberAttribute(tag, "ry")) return null;
    return `M${x} ${y}H${x + width}V${y + height}H${x}Z`;
  }
  if (object.tagName === "circle" || object.tagName === "ellipse") {
    const cx = numberAttribute(tag, "cx");
    const cy = numberAttribute(tag, "cy");
    const rx = object.tagName === "circle" ? numberAttribute(tag, "r") : numberAttribute(tag, "rx");
    const ry = object.tagName === "circle" ? rx : numberAttribute(tag, "ry");
    if (rx <= 0 || ry <= 0) return null;
    return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
  }
  if (object.tagName === "polygon") {
    const points = String(readAttribute(tag, "points") || "").trim();
    const numbers = points.split(/[\s,]+/).map(Number);
    if (numbers.length < 6 || numbers.length % 2 || numbers.some((number) => !Number.isFinite(number))) return null;
    return `M${numbers[0]} ${numbers[1]}${numbers.slice(2).reduce((path, value, index) => index % 2 ? `${path} ${value}` : `${path}L${value}`, "")}Z`;
  }
  return null;
}

function closeBezierPath(path) {
  if (!path || path.knots.length < 2) return null;
  const first = path.knots[0];
  const last = path.knots[path.knots.length - 1];
  if (first.points[2] === last.points[2] && first.points[3] === last.points[3]) {
    first.points[0] = last.points[0];
    first.points[1] = last.points[1];
    path.knots.pop();
  }
  path.open = false;
  return path.knots.length >= 2 ? path : null;
}

function pathDataToBezierPaths(pathData, root, width, height, fillRule) {
  const paths = [];
  let current = null;
  const scaleX = width / root.width;
  const scaleY = height / root.height;
  const point = (x, y) => [(x - root.x) * scaleX, (y - root.y) * scaleY];
  const knot = (x, y) => {
    const [px, py] = point(x, y);
    return { linked: false, points: [px, py, px, py, px, py] };
  };
  const finish = () => {
    const closed = closeBezierPath(current);
    if (closed) paths.push(closed);
    current = null;
  };

  try {
    svgpath(pathData).abs().unshort().unarc().iterate((segment, _index, startX, startY) => {
      const command = segment[0];
      if (command === "M") {
        finish();
        current = { open: false, operation: "combine", fillRule, knots: [knot(segment[1], segment[2])] };
        return;
      }
      if (!current) throw new Error("Path segment precedes its move command.");
      const previous = current.knots[current.knots.length - 1];
      if (command === "L") {
        current.knots.push(knot(segment[1], segment[2]));
      } else if (command === "H") {
        current.knots.push(knot(segment[1], startY));
      } else if (command === "V") {
        current.knots.push(knot(startX, segment[1]));
      } else if (command === "C") {
        const outgoing = point(segment[1], segment[2]);
        previous.points[4] = outgoing[0];
        previous.points[5] = outgoing[1];
        const next = knot(segment[5], segment[6]);
        const incoming = point(segment[3], segment[4]);
        next.points[0] = incoming[0];
        next.points[1] = incoming[1];
        current.knots.push(next);
      } else if (command === "Q") {
        const endX = segment[3];
        const endY = segment[4];
        const controlX = segment[1];
        const controlY = segment[2];
        const outgoing = point(startX + (2 / 3) * (controlX - startX), startY + (2 / 3) * (controlY - startY));
        previous.points[4] = outgoing[0];
        previous.points[5] = outgoing[1];
        const next = knot(endX, endY);
        const incoming = point(endX + (2 / 3) * (controlX - endX), endY + (2 / 3) * (controlY - endY));
        next.points[0] = incoming[0];
        next.points[1] = incoming[1];
        current.knots.push(next);
      } else if (command === "Z") {
        finish();
      } else {
        throw new Error(`Unsupported normalized SVG path command: ${command}`);
      }
    });
    finish();
    return paths.length ? paths : null;
  } catch {
    return null;
  }
}

export function recolorableShapeData(object, svgText, width, height) {
  if (!object || !["path", "rect", "circle", "ellipse", "polygon"].includes(object.tagName)) return null;
  if (/\b(?:clip-path|mask|filter)\s*=/i.test(object.markup)) return null;
  if (!hasOnlyIdentityTransforms(object.markup)) return null;
  // CSS selectors can change the rendered color without exposing it on the leaf.
  // Keep class-styled artwork rasterized so the PSD preview never changes color.
  if (/\bclass\s*=/i.test(object.markup)) return null;
  const stroke = presentationValue(object.markup, "stroke");
  if (stroke && stroke.toLowerCase() !== "none") return null;
  const opacityValues = [
    ...presentationValues(object.markup, "opacity"),
    ...presentationValues(object.markup, "fill-opacity"),
  ];
  if (opacityValues.some((value) => Number.parseFloat(value) !== 1)) return null;
  const color = parseSolidColor(presentationValue(object.markup, "fill") || "#000000");
  const pathData = objectPathData(object);
  if (!color || !pathData) return null;
  const fillRule = presentationValue(object.markup, "fill-rule") === "evenodd" ? "even-odd" : "non-zero";
  const paths = pathDataToBezierPaths(pathData, rootGeometry(svgText), width, height, fillRule);
  if (!paths) return null;
  return {
    vectorFill: { type: "color", color },
    vectorMask: { fillStartsWithAllPixels: false, paths },
    usingAlignedRendering: true,
  };
}

function unionBounds(boundsList) {
  return boundsList.reduce((union, bounds) => [
    Math.min(union[0], bounds[0]),
    Math.min(union[1], bounds[1]),
    Math.max(union[2], bounds[2]),
    Math.max(union[3], bounds[3]),
  ]);
}

export function batchMicroscopicSvgObjects(objects, svgText, enabled = true) {
  if (!enabled || objects.length < 2) return objects;
  const root = rootGeometry(svgText);
  const rootArea = root.width * root.height;
  const output = [];
  let pending = [];
  let batchNumber = 0;

  const flush = () => {
    if (pending.length === 0) return;
    if (pending.length === 1) {
      output.push(pending[0].object);
    } else {
      batchNumber++;
      output.push({
        tagName: "artwork",
        elementTag: `<g data-name="Detail Batch ${String(batchNumber).padStart(3, "0")}">`,
        markup: pending.map(({ object }) => object.markup).join("\n"),
        sourceIndex: pending[0].object.sourceIndex,
        bounds: unionBounds(pending.map(({ bounds }) => bounds)),
      });
    }
    pending = [];
  };

  for (const object of objects) {
    const bounds = pathBounds(object);
    const width = bounds ? Math.max(0, bounds[2] - bounds[0]) : Infinity;
    const height = bounds ? Math.max(0, bounds[3] - bounds[1]) : Infinity;
    const isMicroscopic = bounds
      && width * height <= rootArea * MICRO_DETAIL_AREA_RATIO
      && width <= root.width * MICRO_DETAIL_SPAN_RATIO
      && height <= root.height * MICRO_DETAIL_SPAN_RATIO;

    if (!isMicroscopic) {
      flush();
      output.push(object);
      continue;
    }

    pending.push({ object, bounds });
    if (pending.length >= MICRO_DETAIL_BATCH_SIZE) flush();
  }
  flush();
  return output;
}

function objectCrop(object, svgText, width, height) {
  const bounds = pathBounds(object);
  if (!bounds) return null;
  const root = rootGeometry(svgText);
  const scaleX = width / root.width;
  const scaleY = height / root.height;
  const padding = 3;
  const left = Math.max(0, Math.floor((bounds[0] - root.x) * scaleX) - padding);
  const top = Math.max(0, Math.floor((bounds[1] - root.y) * scaleY) - padding);
  const right = Math.min(width, Math.ceil((bounds[2] - root.x) * scaleX) + padding);
  const bottom = Math.min(height, Math.ceil((bounds[3] - root.y) * scaleY) + padding);
  if (right <= left || bottom <= top) return null;
  return {
    left,
    top,
    right,
    bottom,
    viewX: root.x + left / scaleX,
    viewY: root.y + top / scaleY,
    viewWidth: (right - left) / scaleX,
    viewHeight: (bottom - top) / scaleY,
  };
}

function isolatedCroppedSvg(svgText, markup, crop) {
  const { openTag, inner } = svgRoot(svgText);
  const shared = sharedSvgBlocks(inner);
  let croppedOpenTag = openTag
    .replace(/\swidth\s*=\s*(["']).*?\1/i, "")
    .replace(/\sheight\s*=\s*(["']).*?\1/i, "")
    .replace(/\sviewBox\s*=\s*(["']).*?\1/i, "")
    .replace(/\spreserveAspectRatio\s*=\s*(["']).*?\1/i, "")
    .replace(/>$/, ` viewBox="${crop.viewX} ${crop.viewY} ${crop.viewWidth} ${crop.viewHeight}" width="${crop.right - crop.left}" height="${crop.bottom - crop.top}" preserveAspectRatio="none">`);
  return `${croppedOpenTag}${shared ? `\n${shared}` : ""}\n${markup}\n</svg>`;
}

function svgAtRenderSize(svgText, width, height) {
  const { openTag } = svgRoot(svgText);
  const sourceWidth = numericLength(readAttribute(openTag, "width")) || width;
  const sourceHeight = numericLength(readAttribute(openTag, "height")) || height;
  let sizedOpenTag = openTag
    .replace(/\swidth\s*=\s*(["']).*?\1/i, "")
    .replace(/\sheight\s*=\s*(["']).*?\1/i, "");
  if (!readAttribute(sizedOpenTag, "viewBox")) {
    sizedOpenTag = sizedOpenTag.replace(/>$/, ` viewBox="0 0 ${sourceWidth} ${sourceHeight}">`);
  }
  sizedOpenTag = sizedOpenTag.replace(/>$/, ` width="${width}" height="${height}">`);
  return svgText.replace(openTag, sizedOpenTag);
}

async function renderRgba(svgText, width, height) {
  const renderSvg = svgAtRenderSize(svgText, width, height);
  const { data, info } = await sharp(Buffer.from(renderSvg), {
    // The final pixel size is controlled by resize(). Keeping SVG input density
    // at the normal screen value avoids an unnecessary huge intermediate raster.
    density: 72,
    limitInputPixels: MAX_CANVAS_PIXELS,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.width !== width || info.height !== height || info.channels !== 4) {
    throw new Error("The SVG renderer returned unexpected pixel dimensions.");
  }

  return data;
}

export function trimTransparentRgba(data, width, height) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX || maxY < minY) return null;
  const croppedWidth = maxX - minX + 1;
  const croppedHeight = maxY - minY + 1;
  const cropped = new Uint8Array(croppedWidth * croppedHeight * 4);

  for (let y = 0; y < croppedHeight; y++) {
    const sourceStart = ((minY + y) * width + minX) * 4;
    const targetStart = y * croppedWidth * 4;
    cropped.set(data.subarray(sourceStart, sourceStart + croppedWidth * 4), targetStart);
  }

  return {
    data: cropped,
    width: croppedWidth,
    height: croppedHeight,
    left: minX,
    top: minY,
    right: maxX + 1,
    bottom: maxY + 1,
  };
}

function displayLayerName(label, occurrence) {
  const base = LAYER_NAMES[label] || label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ") || "Other";
  return occurrence > 1 ? `${base} ${occurrence}` : base;
}

function objectLayerName(object, index) {
  const explicitName = readAttribute(object.elementTag, "data-name")
    || readAttribute(object.elementTag, "aria-label")
    || readAttribute(object.elementTag, "id");
  if (explicitName) return explicitName.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 120);
  const type = object.tagName.charAt(0).toUpperCase() + object.tagName.slice(1);
  return `${type} ${String(index + 1).padStart(4, "0")}`;
}

async function renderSvgObject(svgText, object, width, height) {
  const crop = objectCrop(object, svgText, width, height);
  if (!crop) {
    const rgba = await renderRgba(isolatedSvg(svgText, object.markup), width, height);
    return trimTransparentRgba(rgba, width, height);
  }

  const renderSvg = isolatedCroppedSvg(svgText, object.markup, crop);
  const { data, info } = await sharp(Buffer.from(renderSvg), {
    density: 72,
    limitInputPixels: MAX_CANVAS_PIXELS,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const trimmed = trimTransparentRgba(data, info.width, info.height);
  if (!trimmed) return null;
  return {
    ...trimmed,
    left: crop.left + trimmed.left,
    top: crop.top + trimmed.top,
    right: crop.left + trimmed.right,
    bottom: crop.top + trimmed.bottom,
  };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function safeRenderConcurrency(requested, objectCount) {
  const adaptiveLimit = objectCount > COMPLEX_SVG_OBJECT_THRESHOLD
    ? COMPLEX_RENDER_CONCURRENCY
    : RENDER_CONCURRENCY;
  const parsed = Number.parseInt(requested, 10);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.min(adaptiveLimit, parsed))
    : adaptiveLimit;
}

export async function buildLayeredPsd(svgText, options = {}) {
  const safeSvg = assertSafeSvg(svgText);
  const { width, height } = resolvePsdCanvasSize(safeSvg, options.longEdge);
  const semanticLayers = extractSemanticSvgLayers(safeSvg);
  const composite = await renderRgba(safeSvg, width, height);
  const occurrences = new Map();
  const rawLayerObjects = semanticLayers.map((layer) => extractLeafSvgObjects(layer.markup));
  const sourceObjectCount = rawLayerObjects.reduce((sum, objects) => sum + Math.max(1, objects.length), 0);
  if (sourceObjectCount > MAX_OBJECT_LAYERS) {
    throw new Error(`The SVG contains too many individual objects (${sourceObjectCount}).`);
  }
  const optimizeComplexSvg = sourceObjectCount > COMPLEX_SVG_OBJECT_THRESHOLD;
  const objectTasks = [];
  let shapeCandidateCount = 0;

  for (let groupIndex = 0; groupIndex < semanticLayers.length; groupIndex++) {
    const layer = semanticLayers[groupIndex];
    const objects = batchMicroscopicSvgObjects(
      rawLayerObjects[groupIndex],
      safeSvg,
      optimizeComplexSvg,
    );
    if (objects.length === 0) {
      objectTasks.push({ groupIndex, objectIndex: 0, object: {
        tagName: "artwork",
        elementTag: "<g>",
        markup: layer.markup,
        sourceIndex: layer.sourceIndex,
      } });
      continue;
    }
    objects.forEach((object, objectIndex) => {
      const vectorShape = layer.label !== "text" && shapeCandidateCount < MAX_VECTOR_SHAPE_LAYERS
        ? recolorableShapeData(object, safeSvg, width, height)
        : null;
      if (vectorShape) shapeCandidateCount++;
      objectTasks.push({ groupIndex, objectIndex, object, vectorShape });
    });
  }
  const renderedObjects = await mapWithConcurrency(
    objectTasks,
    safeRenderConcurrency(options.renderConcurrency, sourceObjectCount),
    async (task) => ({ ...task, trimmed: await renderSvgObject(safeSvg, task.object, width, height) }),
  );
  const renderedGroups = [];
  let layerCount = 0;
  const layerNames = [];

  for (let groupIndex = 0; groupIndex < semanticLayers.length; groupIndex++) {
    const layer = semanticLayers[groupIndex];
    const occurrence = (occurrences.get(layer.label) || 0) + 1;
    occurrences.set(layer.label, occurrence);
    const children = renderedObjects
      .filter((rendered) => rendered.groupIndex === groupIndex && rendered.trimmed)
      .map((rendered) => {
        const { trimmed, object, objectIndex, vectorShape } = rendered;
        const name = objectLayerName(object, objectIndex);
        layerNames.push(name);
        layerCount++;
        return {
          name,
          top: trimmed.top,
          left: trimmed.left,
          bottom: trimmed.bottom,
          right: trimmed.right,
          blendMode: "normal",
          opacity: 255,
          imageData: {
            width: trimmed.width,
            height: trimmed.height,
            data: trimmed.data,
          },
          ...(vectorShape || {}),
        };
      });
    if (children.length > 0) {
      renderedGroups.push({
        name: displayLayerName(layer.label, occurrence),
        opened: false,
        blendMode: "pass through",
        children,
      });
    }
  }

  if (layerCount === 0) {
    throw new Error("No visible SVG layers could be rendered.");
  }

  const compositeImageData = {
    width,
    height,
    data: Uint8Array.from(composite),
  };
  const psd = {
    width,
    height,
    imageData: compositeImageData,
    imageResources: {
      resolutionInfo: {
        horizontalResolution: 300,
        horizontalResolutionUnit: "PPI",
        widthUnit: "Inches",
        verticalResolution: 300,
        verticalResolutionUnit: "PPI",
        heightUnit: "Inches",
      },
    },
    // Keep SVG painter order (back-to-front) for the writer. Photoshop displays
    // the serialized layers in the opposite panel order, leaving later SVG
    // groups above the background exactly as they appear in the SVG preview.
    children: [
      {
        name: "Original Composite (Reference)",
        top: 0,
        left: 0,
        bottom: height,
        right: width,
        hidden: true,
        blendMode: "normal",
        opacity: 255,
        imageData: compositeImageData,
      },
      ...renderedGroups,
    ],
  };

  const buffer = writePsdBuffer(psd, {
    generateThumbnail: false,
    noBackground: true,
    trimImageData: false,
  });
  if (buffer.length > MAX_PSD_BYTES) {
    throw new Error("The layered PSD is too large to export safely.");
  }

  return {
    buffer,
    width,
    height,
    layerCount,
    layerNames,
    groupCount: renderedGroups.length,
    sourceObjectCount,
    optimized: optimizeComplexSvg && layerCount < sourceObjectCount,
    shapeLayerCount: shapeCandidateCount,
  };
}
