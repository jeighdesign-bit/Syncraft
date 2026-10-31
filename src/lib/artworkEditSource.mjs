import sharp from 'sharp';

// Keep the artwork proportions and prepare verified bytes for provider storage.
export async function prepareArtworkEditSource(buffer) {
  const png = await sharp(buffer, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 4096, height: 4096, fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  if (png.length > 15 * 1024 * 1024) throw new Error('Artwork reference is too large.');
  return png;
}

export async function uploadArtworkEditSource(buffer, { uploadFile }) {
  const png = await prepareArtworkEditSource(buffer);
  const url = await uploadFile(new File([png], 'artwork-edit-source.png', { type: 'image/png' }));
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new Error('Artwork upload returned no secure file URL.');
  }
  return url;
}
