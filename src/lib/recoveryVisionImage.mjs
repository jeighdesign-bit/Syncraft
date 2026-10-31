import sharp from 'sharp';

// VLMs can squeeze an entire narrow ribbon into a tiny input thumbnail.
// Present one overview plus ordered, overlapping-free detail crops instead.
// These images are for inspection only; generation receives the original.
export async function recoveryVisionImage(buffer) {
  const upright = await sharp(buffer).rotate().toBuffer();
  const meta = await sharp(upright).metadata();
  const { width, height } = meta;
  if (Math.max(width / height, height / width) < 3) {
    return `data:image/png;base64,${(await sharp(upright).resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).png().toBuffer()).toString('base64')}`;
  }
  const vertical = height > width;
  const count = 4, cell = 512;
  const images = [];
  images.push({ input: await sharp(upright).resize(cell, cell, { fit: 'contain', background: '#dddddd' }).png().toBuffer(), left: 0, top: 0 });
  for (let i = 0; i < count; i++) {
    const length = vertical ? height : width;
    const start = Math.floor(i * length / count);
    const end = Math.floor((i + 1) * length / count);
    const region = vertical ? { left: 0, top: start, width, height: end - start }
      : { left: start, top: 0, width: end - start, height };
    images.push({ input: await sharp(upright).extract(region).resize(cell, cell, { fit: 'contain', background: '#dddddd' }).png().toBuffer(), left: (i + 1) * cell, top: 0 });
  }
  const sheet = await sharp({ create: { width: cell * 5, height: cell, channels: 3, background: '#dddddd' } }).composite(images).png().toBuffer();
  return `data:image/png;base64,${sheet.toString('base64')}`;
}
