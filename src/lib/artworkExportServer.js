import sharp from 'sharp';

export async function encodeArtworkImage(buffer, format) {
  const image = sharp(buffer, { limitInputPixels: 100_000_000 });
  if (format === 'jpg') return image.flatten({ background: '#ffffff' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer();
  if (format !== 'png') throw new Error('Choose PNG or JPEG.');
  const metadata = await image.metadata();
  // Saved PNGs can be delivered directly without another large encoding pass.
  return metadata.format === 'png' ? buffer : image.png().toBuffer();
}
