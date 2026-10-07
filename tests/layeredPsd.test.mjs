import test from "node:test";
import assert from "node:assert/strict";
import { readPsd } from "ag-psd";

import {
  assertSafeSvg,
  batchMicroscopicSvgObjects,
  buildLayeredPsd,
  extractLeafSvgObjects,
  extractSemanticSvgLayers,
  recolorableShapeData,
  resolvePsdCanvasSize,
  trimTransparentRgba,
} from "../src/lib/layeredPsd.mjs";

const GROUPED_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 100">
  <g id="layer-background" data-layer="background">
    <rect x="0" y="0" width="200" height="100" fill="#102030"/>
  </g>
  <g id="layer-logo" data-layer="logo">
    <circle cx="100" cy="50" r="20" fill="#ff3355"/>
  </g>
  <g id="layer-text" data-layer="text">
    <rect x="85" y="42" width="30" height="16" fill="#ffffff"/>
  </g>
</svg>`;

test("extracts semantic SVG groups in painter order", () => {
  const layers = extractSemanticSvgLayers(GROUPED_SVG);
  assert.deepEqual(layers.map((layer) => layer.label), ["background", "logo", "text"]);
});

test("extracts every SVG leaf object while retaining its group wrapper", () => {
  const [background, logo] = extractSemanticSvgLayers(GROUPED_SVG);
  const backgroundObjects = extractLeafSvgObjects(background.markup);
  const logoObjects = extractLeafSvgObjects(logo.markup);
  assert.equal(backgroundObjects.length, 1);
  assert.equal(logoObjects.length, 1);
  assert.match(backgroundObjects[0].markup, /<g id="layer-background"/);
  assert.match(backgroundObjects[0].markup, /<rect /);
  assert.match(logoObjects[0].markup, /<circle /);
});

test("falls back to one artwork layer for legacy ungrouped SVGs", () => {
  const layers = extractSemanticSvgLayers('<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>');
  assert.equal(layers.length, 1);
  assert.equal(layers[0].label, "artwork");
});

test("rejects active and external SVG content", () => {
  assert.throws(
    () => assertSafeSvg('<svg><script>alert(1)</script></svg>'),
    /unsupported active content/,
  );
  assert.throws(
    () => assertSafeSvg('<svg><image href="https://example.com/a.png"/></svg>'),
    /external asset reference/,
  );
});

test("uses a 4K long edge while preserving the viewBox aspect ratio", () => {
  assert.deepEqual(resolvePsdCanvasSize(GROUPED_SVG), { width: 4096, height: 2048 });
});

test("trims transparent RGBA pixels without changing their placement", () => {
  const rgba = new Uint8Array(4 * 3 * 4);
  rgba.set([10, 20, 30, 255], (1 * 4 + 2) * 4);
  const trimmed = trimTransparentRgba(rgba, 4, 3);
  assert.deepEqual(
    { width: trimmed.width, height: trimmed.height, left: trimmed.left, top: trimmed.top },
    { width: 1, height: 1, left: 2, top: 1 },
  );
  assert.deepEqual([...trimmed.data], [10, 20, 30, 255]);
});

test("batches consecutive microscopic paths while preserving large editable shapes", () => {
  const tinyPaths = Array.from({ length: 200 }, (_, index) => ({
    tagName: "path",
    elementTag: `<path d="M${index % 20} ${Math.floor(index / 20)}h0.2v0.2h-0.2z"/>`,
    markup: `<path d="M${index % 20} ${Math.floor(index / 20)}h0.2v0.2h-0.2z"/>`,
    sourceIndex: index,
  }));
  const largeShape = {
    tagName: "path",
    elementTag: '<path d="M0 0H100V50H0Z"/>',
    markup: '<path d="M0 0H100V50H0Z"/>',
    sourceIndex: 201,
  };
  const optimized = batchMicroscopicSvgObjects(
    [...tinyPaths, largeShape],
    '<svg viewBox="0 0 100 100"></svg>',
  );

  assert.equal(optimized.length, 4);
  assert.match(optimized[0].elementTag, /Detail Batch 001/);
  assert.match(optimized[1].elementTag, /Detail Batch 002/);
  assert.equal(optimized[2].tagName, "artwork");
  assert.equal(optimized[3], largeShape);
});

test("converts supported solid SVG geometry into recolorable Photoshop shape data", () => {
  const [logo] = extractLeafSvgObjects('<g><path transform="translate(0,0)" d="M10 10H90V90H10Z" fill="#ff3355"/></g>');
  const shape = recolorableShapeData(
    logo,
    '<svg viewBox="0 0 100 100"></svg>',
    500,
    500,
  );

  assert.deepEqual(shape.vectorFill, { type: "color", color: { r: 255, g: 51, b: 85 } });
  assert.equal(shape.vectorMask.paths.length, 1);
  assert.equal(shape.vectorMask.paths[0].open, false);
  assert.equal(shape.vectorMask.paths[0].knots.length, 4);
});

test("keeps unsupported SVG effects on the raster fallback", () => {
  const [gradient] = extractLeafSvgObjects('<path d="M0 0H10V10Z" fill="url(#paint)"/>');
  const [transformed] = extractLeafSvgObjects('<g transform="translate(2 3)"><rect width="10" height="10" fill="#fff"/></g>');
  const [classStyled] = extractLeafSvgObjects('<path class="brand" d="M0 0H10V10Z"/>');
  const [transparentParent] = extractLeafSvgObjects('<g opacity=".5"><path opacity="1" d="M0 0H10V10Z" fill="#fff"/></g>');
  const svg = '<svg viewBox="0 0 10 10"></svg>';
  assert.equal(recolorableShapeData(gradient, svg, 100, 100), null);
  assert.equal(recolorableShapeData(transformed, svg, 100, 100), null);
  assert.equal(recolorableShapeData(classStyled, svg, 100, 100), null);
  assert.equal(recolorableShapeData(transparentParent, svg, 100, 100), null);
});

test("builds a readable hybrid PSD with recolorable shapes and a hidden reference", async () => {
  const result = await buildLayeredPsd(GROUPED_SVG, { longEdge: 512 });
  const psd = readPsd(result.buffer, {
    skipLayerImageData: true,
    skipCompositeImageData: true,
    skipThumbnail: true,
  });

  assert.equal(result.width, 512);
  assert.equal(result.height, 256);
  assert.equal(result.layerCount, 3);
  assert.equal(result.groupCount, 3);
  assert.equal(result.shapeLayerCount, 2);
  assert.deepEqual(psd.children.map((layer) => layer.name), [
    "Original Composite (Reference)",
    "Background",
    "Logos",
    "Text",
  ]);
  assert.equal(psd.children[0].hidden, true);
  assert.deepEqual(psd.children.slice(1).map((group) => group.children.length), [1, 1, 1]);
  assert.deepEqual(psd.children.slice(1).map((group) => group.children[0].name), [
    "Rect 0001",
    "Circle 0001",
    "Rect 0001",
  ]);
  assert.deepEqual(psd.children.slice(1).map((group) => Boolean(group.children[0].vectorMask)), [
    true,
    true,
    false,
  ]);
  assert.deepEqual(psd.children[1].children[0].vectorFill, {
    type: "color",
    color: { r: 16, g: 32, b: 48 },
  });
});
