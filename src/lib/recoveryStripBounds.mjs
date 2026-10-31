import sharp from 'sharp';

// A large blank field can survive a failed lanyard extraction while a visual
// reviewer concentrates on the remaining lettering. This is a warning only:
// uniform regions can be intentional print, so this helper never crops them.
export async function inspectStripExterior(buffer, { category, mode, analysis = {}, method } = {}) {
  if (category !== 'lanyard' || mode !== 'UNIVERSAL_KEEP_ARTWORK'
    || analysis.presentation_type === 'digital_artwork' || analysis.already_flat === true
    || !['image_edit', 'planar_rectification'].includes(method)
    || (method === 'planar_rectification' && analysis.presentation_type !== 'physical_surface')) return null;

  const { data, info } = await sharp(buffer).rotate()
    .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' }).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const vertical = info.height >= info.width;
  const short = vertical ? info.width : info.height;
  const long = vertical ? info.height : info.width;
  const columns = [];
  for (let column = 0; column < short; column++) {
    const sum = [0, 0, 0], sumSquares = [0, 0, 0];
    for (let row = 0; row < long; row++) {
      const offset = (vertical ? row * info.width + column : column * info.width + row) * 3;
      for (let c = 0; c < 3; c++) {
        const value = data[offset + c];
        sum[c] += value; sumSquares[c] += value * value;
      }
    }
    const mean = sum.map(value => value / long);
    const deviation = mean.map((value, c) => Math.sqrt(Math.max(0, sumSquares[c] / long - value * value)));
    const light = Math.min(...mean) >= 210;
    const dark = Math.max(...mean) <= 45;
    const neutral = Math.max(...mean) - Math.min(...mean) <= 18;
    let matching = 0;
    if (neutral && (light || dark) && Math.max(...deviation) <= 8) {
      for (let row = 0; row < long; row++) {
        const offset = (vertical ? row * info.width + column : column * info.width + row) * 3;
        if (mean.every((value, c) => Math.abs(data[offset + c] - value) <= 12)) matching++;
      }
    }
    columns.push({ blank: matching / long >= 0.95, detailed: Math.max(...deviation) >= 16 });
  }
  let start = 0, end = 0;
  while (start < short && columns[start].blank) start++;
  while (end < short - start && columns[short - 1 - end].blank) end++;
  const remaining = short - start - end;
  const detailed = columns.slice(start, short - end).filter(column => column.detailed).length;
  const blankFraction = (start + end) / short;
  const hasInkBand = remaining >= Math.max(3, Math.ceil(short * 0.03))
    && detailed >= Math.max(2, Math.ceil(remaining * 0.2));
  const suspected = blankFraction >= 0.25 && hasInkBand;
  return {
    suspected_exterior: suspected,
    blank_side_fraction: Math.round(blankFraction * 10000) / 10000,
    orientation: vertical ? 'vertical' : 'horizontal',
    sampled_dimensions: { width: info.width, height: info.height },
    edge_fields: { start_pixels: start, end_pixels: end, axis: vertical ? 'left_right' : 'top_bottom' },
    detailed_band_fraction: Math.round(remaining / short * 10000) / 10000,
    detailed_columns: detailed,
    advisory_only: true,
    reason: suspected
      ? 'Large nearly uniform light or dark edge fields remain beside a detailed ribbon. Compare these fields with the reference; they may be leftover mockup canvas or intentional print.'
      : hasInkBand ? 'No large nearly uniform edge field detected.' : 'No distinct detailed ribbon band detected; use the separate content-collapse check.',
  };
}
