import sharp from 'sharp';
import { assertSafeSvg, extractLeafSvgObjects, recolorableShapeData, resolvePsdCanvasSize } from './layeredPsd.mjs';

export const LOGO_EXPORT_FORMATS = Object.freeze({
  png: { mime: 'image/png', extension: 'png' },
  jpg: { mime: 'image/jpeg', extension: 'jpg' },
  svg: { mime: 'image/svg+xml', extension: 'svg' },
});

export function resolveLogoExportJob(jobs, selectedId, format) {
  if (!Object.hasOwn(LOGO_EXPORT_FORMATS, format)) throw new Error('Choose PNG, JPG or SVG.');
  const selected = jobs.find(job => job.id === selectedId && job.status === 'succeeded' && job.url);
  if (!selected) throw new Error('Select a finished logo to download.');
  if (format !== 'svg' || selected.format === 'svg') return selected;
  const vector = [...jobs].reverse().find(job => job.operation === 'vectorize' && job.sourceId === selected.id
    && job.status === 'succeeded' && job.format === 'svg' && job.url);
  if (!vector) throw new Error('Vectorize this logo first to download SVG.');
  return vector;
}

function safeVector(buffer) {
  const svg = assertSafeSvg(buffer.toString('utf8'));
  if (/<(?:image|use)\b|\bon\w+\s*=|@import/i.test(svg)) throw new Error('This SVG contains unsupported references or active content.');
  return svg;
}

const number = value => {
  if (!Number.isFinite(value) || Math.abs(value) > 1e7) throw new Error('The vector contains invalid coordinates.');
  return String(Number(value.toFixed(5)));
};

// A revisable, PostScript-based Illustrator 7 document. This writes actual AI
// path/color operators, not SVG or PDF bytes with a different extension.
// Format reference: Adobe Illustrator File Format Specification, 23 Feb 1998.
export function buildLegacyIllustrator(svgText) {
  const svg = safeVector(Buffer.from(svgText));
  const unsupported = 'This artwork uses effects that legacy AI cannot preserve. Download SVG and save as AI in Illustrator instead.';
  if (/<style\b|\b(?:display|visibility)\s*[:=]/i.test(svg)) throw new Error(unsupported);
  const { width, height } = resolvePsdCanvasSize(svg, 1024);
  const objects = extractLeafSvgObjects(svg);
  if (!objects.length || objects.length > 10000) throw new Error('This vector is empty or too complex for AI export.');
  const shapes = objects.map(object => {
    const shape = recolorableShapeData(object, svg, width, height);
    if (!shape) throw new Error(unsupported);
    return shape;
  });
  const lines = [
    '%!PS-Adobe-3.0 EPSF-3.0',
    '%%Creator: Syncraft (Illustrator 7 compatible)',
    `%%BoundingBox: 0 0 ${width} ${height}`,
    `%%HiResBoundingBox: 0 0 ${width} ${height}`,
    '%%Pages: 1', '%%DocumentData: Clean7Bit', '%%LanguageLevel: 2',
    '%AI5_FileFormat 3', '%AI3_ColorUsage: Color', '%%EndComments',
    '%%BeginProlog',
    '32 dict begin',
    '/scCompound false def /scEvenOdd false def /scColor [0 0 0] def',
    '/scPaint { scColor aload pop setrgbcolor scEvenOdd { eofill } { fill } ifelse } bind def',
    '/Xa { 3 array astore /scColor exch def } bind def',
    '/XR { 1 eq /scEvenOdd exch def } bind def',
    '/m { scCompound not { newpath } if moveto } bind def',
    '/l { lineto } bind def /c { curveto } bind def',
    '/f { closepath scCompound not { scPaint } if } bind def',
    '/*u { /scCompound true def newpath } bind def',
    '/*U { /scCompound false def scPaint } bind def',
    '%%EndProlog', '%%BeginSetup', '%%EndSetup', '%%Page: 1 1',
  ];
  const point = (x, y) => `${number(x)} ${number(height - y)}`;
  for (const shape of shapes) {
    const { r, g, b } = shape.vectorFill.color;
    const paths = shape.vectorMask.paths;
    lines.push(`${number(r / 255)} ${number(g / 255)} ${number(b / 255)} Xa`,
      `${paths[0].fillRule === 'even-odd' ? 1 : 0} XR`);
    if (paths.length > 1) lines.push('*u');
    for (const path of paths) {
      const knots = path.knots;
      lines.push(`${point(knots[0].points[2], knots[0].points[3])} m`);
      // Closing curves matter: include the last knot's outgoing and the first
      // knot's incoming handles, rather than closing every shape with a line.
      for (let index = 1; index <= knots.length; index++) {
        const previous = knots[index - 1].points;
        const next = knots[index % knots.length].points;
        if (previous[4] === previous[2] && previous[5] === previous[3]
          && next[0] === next[2] && next[1] === next[3]) {
          lines.push(`${point(next[2], next[3])} l`);
        } else {
          lines.push(`${point(previous[4], previous[5])} ${point(next[0], next[1])} ${point(next[2], next[3])} c`);
        }
      }
      lines.push('f');
    }
    if (paths.length > 1) lines.push('*U');
  }
  lines.push('%%PageTrailer', 'showpage', '%%Trailer', 'end', '%%EOF', '');
  const buffer = Buffer.from(lines.join('\n'), 'ascii');
  if (buffer.length > 32 * 1024 * 1024) throw new Error('The AI export is too large. Download SVG instead.');
  return buffer;
}

export async function createLogoExport(buffer, sourceFormat, format) {
  if (!Object.hasOwn(LOGO_EXPORT_FORMATS, format)) throw new Error('Unsupported download format.');
  const svg = sourceFormat === 'svg' ? safeVector(buffer) : null;
  if (format === 'svg') {
    if (!svg) throw new Error('Vectorize this logo first to download SVG.');
    return Buffer.from(svg);
  }
  const image = sharp(buffer, { limitInputPixels: 25_000_000 });
  const metadata = await image.metadata();
  if (!['png', 'jpeg', 'webp', 'svg'].includes(metadata.format)) throw new Error('Unsupported logo image.');
  // JPEG has no alpha channel. A deliberate white matte avoids black backgrounds.
  return format === 'jpg'
    ? image.flatten({ background: '#ffffff' }).jpeg({ quality: 95, chromaSubsampling: '4:4:4' }).toBuffer()
    : image.png().toBuffer();
}
