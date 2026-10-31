import sharp from 'sharp';
import { recoveryModeInstructions } from './recoveryVision.mjs';

export async function matchRecoveryStripProportions(buffer, width, height) {
  const multiplier = Math.max(1, Math.min(8, Math.floor(2048 / Math.max(width, height))));
  return sharp(buffer).resize(width * multiplier, height * multiplier, { fit: 'fill' }).png().toBuffer();
}

export function buildStripRecoveryInput(input, strip, mode) {
  return { ...input, aspect_ratio: 'auto', prompt: `${stripEditInstructions(strip)}\n${recoveryModeInstructions(mode)}\nThis is a localized image edit, not a new pattern design. Preserve the supplied section layout exactly, with no new repeats or decorative features. Return only the same edited grid.` };
}

export async function prepareRecoveryStrip(buffer) {
  const upright = await sharp(buffer).rotate().png().toBuffer();
  const { width, height } = await sharp(upright).metadata();
  if (width / height >= 0.35 && width / height <= 3) return null;
  const vertical = height > width;
  const long = Math.max(width, height), short = Math.min(width, height);
  const count = Math.min(8, Math.max(2, Math.ceil(Math.sqrt(long / short))));
  const length = Math.ceil(long / count);
  const scale = Math.max(1, Math.min(8, Math.floor(1600 / Math.max(count * short, length))));
  const tileWidth = (vertical ? short : length) * scale, tileHeight = (vertical ? length : short) * scale;
  const padded = await sharp(upright).extend({ top: 0, left: 0, right: vertical ? 0 : length * count - width,
    bottom: vertical ? length * count - height : 0, background: '#808080' }).png().toBuffer();
  const gutter = Math.max(2, Math.round(Math.min(tileWidth, tileHeight) * 0.05));
  const carrierWidth = vertical ? tileWidth * count + gutter * (count + 1) : tileWidth + 2 * gutter;
  const carrierHeight = vertical ? tileHeight + 2 * gutter : tileHeight * count + gutter * (count + 1);
  const pieces = [], cells = [];
  for (let i = 0; i < count; i++) pieces.push({ input: await sharp(padded).extract({ left: vertical ? 0 : i * length,
    top: vertical ? i * length : 0, width: vertical ? width : length, height: vertical ? length : height })
    .resize(tileWidth, tileHeight).png().toBuffer(), left: vertical ? gutter + i * (tileWidth + gutter) : gutter, top: vertical ? gutter : gutter + i * (tileHeight + gutter) });
  for (const piece of pieces) cells.push({ left: piece.left / carrierWidth, top: piece.top / carrierHeight, width: tileWidth / carrierWidth, height: tileHeight / carrierHeight });
  const carrier = await sharp({ create: { width: carrierWidth, height: carrierHeight,
    channels: 4, background: '#808080' } }).composite(pieces).png().toBuffer();
  return { buffer: carrier, width, height, vertical, count, length, cells };
}

export function stripEditInstructions(strip) {
  return `FIXED EDIT GRID: this is ONE original narrow artwork cut into ${strip.count} equal ${strip.vertical ? 'vertical columns arranged left to right, in original top-to-bottom order' : 'horizontal rows arranged top to bottom, in original left-to-right order'}. Gray gutters separate the sections; keep every gutter exactly in place and do not generate artwork in the gutters. Edit each image cell in place. Return the EXACT SAME grid, with the same cell boundaries and dimensions. Do not join cells, redraw the layout, repeat motifs, extend a motif into another cell, or invent a seamless tiling pattern. The application will rejoin these original consecutive sections into the original strip. Preserve every retained illustration, line, motif, color, scale, placement and visible texture in its own cell. Only remove identity lettering and logos if pattern-only mode is selected; integrated decorative illustrations remain. Do not add new diagonal bands or continue the first cell's pattern through the other cells. No cell labels, dividing lines or annotations.`;
}

export async function restoreRecoveryStrip(buffer, strip) {
  const meta = await sharp(buffer).metadata();
  const multiplier = Math.max(1, Math.min(8, Math.floor(2048 / Math.max(strip.width, strip.height))));
  const width = strip.width * multiplier, height = strip.height * multiplier;
  const tileWidth = (strip.vertical ? strip.width : strip.length) * multiplier;
  const tileHeight = (strip.vertical ? strip.length : strip.height) * multiplier;
  const pieces = [];
  for (let i = 0; i < strip.count; i++) {
    const cell = strip.cells[i];
    const left = Math.round(cell.left * meta.width), top = Math.round(cell.top * meta.height);
    const right = Math.min(meta.width, Math.round((cell.left + cell.width) * meta.width));
    const bottom = Math.min(meta.height, Math.round((cell.top + cell.height) * meta.height));
    pieces.push({ input: await sharp(buffer).extract({ left, top, width: right - left, height: bottom - top })
      .resize(tileWidth, tileHeight, { fit: 'fill' }).png().toBuffer(), left: strip.vertical ? 0 : i * tileWidth, top: strip.vertical ? i * tileHeight : 0 });
  }
  const assembled = await sharp({ create: { width: strip.vertical ? width : strip.length * strip.count * multiplier,
    height: strip.vertical ? strip.length * strip.count * multiplier : height, channels: 4, background: '#808080' } })
    .composite(pieces).png().toBuffer();
  return sharp(assembled).extract({ left: 0, top: 0, width, height }).png().toBuffer();
}
