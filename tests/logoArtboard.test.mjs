import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { fitImageLogoToArtboard } from '../src/lib/logoArtboard.mjs';

const canvas = async (shape) => sharp({ create: { width: 128, height: 128, channels: 3, background: '#ffffff' } })
  .composite([{ input: { create: { width: shape.width, height: shape.height, channels: 3, background: '#111111' } }, left: shape.left, top: shape.top }])
  .png().toBuffer();

test('image logo touching the artboard edge gains clear space on every side', async () => {
  const output = await fitImageLogoToArtboard(await canvas({ left: 0, top: 8, width: 112, height: 112 }));
  const { data, info } = await sharp(output).raw().toBuffer({ resolveWithObject: true });
  const points = [];
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels] < 80) points.push([x, y]);
    }
  }
  assert.equal(info.width, 128);
  assert.equal(info.height, 128);
  assert.ok(Math.min(...points.map(([x]) => x)) >= 12);
  assert.ok(Math.max(...points.map(([x]) => x)) <= 115);
  assert.ok(Math.min(...points.map(([, y]) => y)) >= 12);
  assert.ok(Math.max(...points.map(([, y]) => y)) <= 115);
});

test('image logo with existing clear space keeps its original pixels', async () => {
  const input = await canvas({ left: 30, top: 28, width: 66, height: 70 });
  const output = await fitImageLogoToArtboard(input);
  assert.strictEqual(output, input);
});

test('nonuniform canvas background is left untouched to avoid visible seams', async () => {
  const input = await sharp({ create: { width: 128, height: 128, channels: 3, background: '#ffffff' } })
    .composite([{ input: { create: { width: 32, height: 32, channels: 3, background: '#b4b4b4' } }, left: 96, top: 96 }])
    .png().toBuffer();
  assert.strictEqual(await fitImageLogoToArtboard(input), input);
});
