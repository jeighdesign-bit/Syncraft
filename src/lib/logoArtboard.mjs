import sharp from 'sharp';

const SAMPLE_SIZE = 256;
const SAFE_FRACTION = 0.76;

// Image models sometimes imitate a tightly cropped reference photo. Reframe only
// flat-background outputs whose artwork approaches the canvas boundary.
export async function fitImageLogoToArtboard(buffer) {
  const source = sharp(buffer, { limitInputPixels: 25_000_000 });
  const metadata = await source.metadata();
  if (!metadata.width || metadata.width !== metadata.height) return buffer;

  const { data, info } = await source.clone().resize(SAMPLE_SIZE, SAMPLE_SIZE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y) => {
    const offset = (y * info.width + x) * info.channels;
    return [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
  };
  const corners = [pixel(0, 0), pixel(info.width - 1, 0), pixel(0, info.height - 1), pixel(info.width - 1, info.height - 1)];
  const background = corners[0];
  if (corners.some(color => color.some((channel, index) => Math.abs(channel - background[index]) > 18))) return buffer;

  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const color = pixel(x, y);
      if (Math.max(...color.map((channel, index) => Math.abs(channel - background[index]))) < 42) continue;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x); bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return buffer;
  const edge = Math.floor(info.width * 0.1);
  if (left >= edge && top >= edge && right < info.width - edge && bottom < info.height - edge) return buffer;

  const side = metadata.width;
  const scale = side / info.width;
  const bleed = Math.ceil(side * 0.015);
  const cropLeft = Math.max(0, Math.floor(left * scale) - bleed);
  const cropTop = Math.max(0, Math.floor(top * scale) - bleed);
  const cropRight = Math.min(side, Math.ceil((right + 1) * scale) + bleed);
  const cropBottom = Math.min(side, Math.ceil((bottom + 1) * scale) + bleed);
  const cropWidth = cropRight - cropLeft;
  const cropHeight = cropBottom - cropTop;
  const target = Math.round(side * SAFE_FRACTION);
  const ratio = Math.min(1, target / cropWidth, target / cropHeight);
  const width = Math.max(1, Math.round(cropWidth * ratio));
  const height = Math.max(1, Math.round(cropHeight * ratio));
  const artwork = await source.clone().extract({ left: cropLeft, top: cropTop, width: cropWidth, height: cropHeight })
    .resize(width, height).png().toBuffer();
  return sharp({ create: { width: side, height: side, channels: 4,
    background: { r: background[0], g: background[1], b: background[2], alpha: background[3] / 255 } } })
    .composite([{ input: artwork, left: Math.floor((side - width) / 2), top: Math.floor((side - height) / 2) }])
    .png().toBuffer();
}
