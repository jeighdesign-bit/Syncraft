import sharp from 'sharp';

const PLANAR_LAYOUTS = new Set(['flat_rectangle', 'large_format_rectangle', 'packaging_panels', 'sticker_decal', 'long_strip']);
const NONE_OR_LOW = new Set(['none', 'low']);

export function canUsePlanarRecovery(analysis, mode) {
  return mode === 'UNIVERSAL_KEEP_ARTWORK' && analysis?.single_surface === true
    && ['digital_artwork', 'physical_surface'].includes(analysis.presentation_type)
    && analysis.surface_geometry === 'planar' && Number.isFinite(analysis.confidence) && analysis.confidence >= 85
    && Number.isFinite(analysis.geometry_confidence) && analysis.geometry_confidence >= 90
    && !!normalizedPrintQuad(analysis.print_quad) && NONE_OR_LOW.has(analysis.curvature)
    && analysis.folds === 'none' && NONE_OR_LOW.has(analysis.reflections) && analysis.occlusion === 'none'
    && PLANAR_LAYOUTS.has(analysis.layout_strategy);
}

export function canPreserveFlatArtwork(analysis, mode) {
  if (mode !== 'UNIVERSAL_KEEP_ARTWORK' || analysis?.already_flat !== true
    || analysis.presentation_type !== 'digital_artwork' || analysis.single_surface !== true
    || !(Number.isFinite(analysis.confidence) && analysis.confidence >= 85)
    || !(Number.isFinite(analysis.geometry_confidence) && analysis.geometry_confidence >= 95)
    || !['perspective', 'curvature', 'folds', 'reflections', 'occlusion'].every(key => analysis[key] === 'none')
    || !Array.isArray(analysis.missing_areas) || analysis.missing_areas.length) return false;
  // A claimed already-flat image must not also identify a smaller print inside
  // the crop. That contradiction can otherwise preserve a whole mockup page.
  if (analysis.print_quad != null) {
    const quad = normalizedPrintQuad(analysis.print_quad);
    const full = [[0, 0], [1000, 0], [1000, 1000], [0, 1000]];
    if (!quad || quad.some((point, i) => point.some((value, axis) => Math.abs(value - full[i][axis]) > 20))) return false;
  }
  return true;
}

export function normalizedPrintQuad(raw) {
  if (!Array.isArray(raw) || raw.length !== 4 || raw.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || v < 0 || v > 1000))) return null;
  const cross = raw.map((p, i) => { const b = raw[(i + 1) % 4], c = raw[(i + 2) % 4]; return (b[0] - p[0]) * (c[1] - b[1]) - (b[1] - p[1]) * (c[0] - b[0]); });
  if (!cross.every(v => v > 0)) return null;
  const area = Math.abs(raw.reduce((n, p, i) => n + p[0] * raw[(i + 1) % 4][1] - p[1] * raw[(i + 1) % 4][0], 0)) / 2;
  // Thin but meaningful ribbon faces may occupy below 1% of a presentation.
  // Still reject collapsed edges and nearly zero-area/degenerate polygons.
  const shortestEdge = Math.min(...raw.map((p, i) => Math.hypot(p[0] - raw[(i + 1) % 4][0], p[1] - raw[(i + 1) % 4][1])));
  return area >= 1000 && shortestEdge >= 1 ? raw : null;
}

function solve(matrix) {
  for (let i = 0; i < 8; i++) {
    let pivot = i;
    for (let r = i + 1; r < 8; r++) if (Math.abs(matrix[r][i]) > Math.abs(matrix[pivot][i])) pivot = r;
    [matrix[i], matrix[pivot]] = [matrix[pivot], matrix[i]];
    const divisor = matrix[i][i];
    if (Math.abs(divisor) < 1e-10) throw new Error('Degenerate print plane');
    for (let c = i; c <= 8; c++) matrix[i][c] /= divisor;
    for (let r = 0; r < 8; r++) if (r !== i) {
      const factor = matrix[r][i];
      for (let c = i; c <= 8; c++) matrix[r][c] -= factor * matrix[i][c];
    }
  }
  return matrix.map(row => row[8]);
}

// Recover the existing pixels of a planar print. No generated text or artwork.
// Corners are TL, TR, BR, BL relative to the design's intended orientation.
export async function rectifyPrintPlane(buffer, quad) {
  if (!normalizedPrintQuad(quad)) throw new Error('Invalid print-plane corners');
  const { data, info } = await sharp(buffer).rotate().resize(4096, 4096, { fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Quads describe artwork edges, not pixel centers. Sampling centers inside
  // those boundaries preserves an identity/full-frame rectangle exactly.
  const q = quad.map(([x, y]) => [x * info.width / 1000, y * info.height / 1000]);
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const targetWidth = (distance(q[0], q[1]) + distance(q[3], q[2])) / 2;
  const targetHeight = (distance(q[0], q[3]) + distance(q[1], q[2])) / 2;
  const width = Math.max(1, Math.round(targetWidth)), height = Math.max(1, Math.round(targetHeight));
  const matrix = [];
  [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i) => { const [x,y] = q[i];
    matrix.push([u,v,1,0,0,0,-x*u,-x*v,x], [0,0,0,u,v,1,-y*u,-y*v,y]); });
  const [a,b,c,d,e,f,g,h] = solve(matrix);
  const denominators = [1, g + 1, g + h + 1, h + 1];
  if (denominators.some(value => !Number.isFinite(value) || value < 1e-6)) throw new Error('Unstable print-plane projection');
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x + 0.5) / width, v = (y + 0.5) / height, denominator = g*u+h*v+1;
    const sx = Math.max(0, Math.min(info.width - 1, (a*u+b*v+c)/denominator - 0.5));
    const sy = Math.max(0, Math.min(info.height - 1, (d*u+e*v+f)/denominator - 0.5));
    const x0 = Math.floor(sx), y0 = Math.floor(sy), x1 = Math.min(x0+1, info.width-1), y1 = Math.min(y0+1, info.height-1);
    const dx = sx-x0, dy = sy-y0;
    const offsets = [(y0*info.width+x0)*4, (y0*info.width+x1)*4, (y1*info.width+x0)*4, (y1*info.width+x1)*4];
    const weights = [(1-dx)*(1-dy), dx*(1-dy), (1-dx)*dy, dx*dy];
    const alpha = offsets.reduce((sum, offset, i) => sum + data[offset+3]*weights[i], 0);
    for (let channel = 0; channel < 3; channel++) output[(y*width+x)*4+channel] = alpha ? Math.round(
      offsets.reduce((sum, offset, i) => sum + data[offset+channel]*data[offset+3]*weights[i], 0) / alpha) : 0;
    output[(y*width+x)*4+3] = Math.round(alpha);
  }
  return sharp(output, { raw: { width, height, channels: 4 } }).png().toBuffer();
}

// This is a recovery strategy, never an automatic visual approval. Geometry is
// supplied by the surface analyzer; uncertain cases continue to image editing.
export async function recoverSourcePixels(buffer, analysis, mode) {
  const flat = canPreserveFlatArtwork(analysis, mode);
  if (!flat && !canUsePlanarRecovery(analysis, mode)) return null;
  const upright = await sharp(buffer).rotate().png().toBuffer();
  const source = await sharp(upright).metadata();
  const output = flat ? upright : await rectifyPrintPlane(upright, analysis.print_quad);
  const target = await sharp(output).metadata();
  const method = flat ? 'source_pixels' : 'planar_rectification';
  return {
    buffer: output,
    method,
    provenance: {
      source_dimensions: { width: source.width, height: source.height },
      output_dimensions: { width: target.width, height: target.height },
      print_quad: flat ? [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] : analysis.print_quad,
      geometry_confidence: analysis.geometry_confidence,
      pixels_regenerated: false,
      resampled: !flat,
      physical_dimensions_known: false,
    },
    validation: {
      pass: false, usable_partial: true, advisory_only: true, failures: [],
      review_status: 'not_run', extraction_method: method, source_pixels_preserved: true,
      correction: flat
        ? 'The selected artwork pixels and crop dimensions are preserved. Compare the selection with your reference before use.'
        : 'The visible print was straightened using its source pixels. Review its boundaries, lettering and lighting; hidden artwork and physical dimensions were not recovered.',
    },
  };
}
