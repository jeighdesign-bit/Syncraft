// Percent coordinates keep the selected area stable when the preview resizes.
export function logoSourceCropRegion(crop, width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1
    || crop?.unit !== '%' || !['x', 'y', 'width', 'height'].every(key => Number.isFinite(crop[key]))
    || crop.width <= 0 || crop.height <= 0) throw new Error('Choose an area of the image first.');
  const x = Math.max(0, Math.min(width - 1, Math.round(crop.x / 100 * width)));
  const y = Math.max(0, Math.min(height - 1, Math.round(crop.y / 100 * height)));
  const right = Math.max(x + 1, Math.min(width, Math.round((crop.x + crop.width) / 100 * width)));
  const bottom = Math.max(y + 1, Math.min(height, Math.round((crop.y + crop.height) / 100 * height)));
  return { x, y, width: right - x, height: bottom - y };
}

export async function createLogoSourceCrop(image, crop, fileName, createCanvas = () => document.createElement('canvas')) {
  const region = logoSourceCropRegion(crop, image.naturalWidth, image.naturalHeight);
  const canvas = createCanvas();
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cropping is unavailable in this browser. Try using the full image.');
  let scale = Math.min(1, 2048 / Math.max(region.width, region.height));
  for (;;) {
    canvas.width = Math.max(1, Math.round(region.width * scale));
    canvas.height = Math.max(1, Math.round(region.height * scale));
    context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
    // PNG preserves transparent reference artwork. Resize only if needed to meet upload limits.
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Could not crop this image. Try again or use the full image.');
    if (blob.size <= 4 * 1024 * 1024) return new File([blob], `${fileName.replace(/\.[^.]+$/, '')}-crop.png`, { type: 'image/png' });
    if (canvas.width === 1 && canvas.height === 1) throw new Error('Could not save this crop. Try using the full image.');
    scale *= 0.75;
  }
}
