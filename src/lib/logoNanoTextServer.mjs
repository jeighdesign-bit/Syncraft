import sharp from 'sharp';
// Accept only the server-validated inspiration bytes, never an unchecked URL.
// New text briefs without inspiration use native Text-to-Image directly.
export async function prepareNanoLogoStyleReference(buffer) {
  const png = await sharp(buffer, { limitInputPixels: 25_000_000 })
    .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}
