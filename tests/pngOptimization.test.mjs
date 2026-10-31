import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { optimizePngLosslessly } from '../src/lib/pngOptimization.mjs';

test('lossless optimization reduces file size while preserving all pixels, resolution, alpha, and DPI', async () => {
  const pixels = Buffer.alloc(600 * 400 * 4);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (Math.floor(i / 4) + i % 4 * 23) % 256;
  const encoded = await sharp(pixels, { raw: { width: 600, height: 400, channels: 4 } }).withMetadata({ density: 300 }).png({ compressionLevel: 0 }).toBuffer();
  // withMetadata adds an ICC profile as well as DPI. Keep this fixture in the
  // unprofiled path; profiled artwork is intentionally preserved byte-for-byte.
  const chunks = [encoded.subarray(0, 8)];
  for (let offset = 8; offset < encoded.length;) {
    const end = offset + encoded.readUInt32BE(offset) + 12;
    if (encoded.toString('ascii', offset + 4, offset + 8) !== 'iCCP') chunks.push(encoded.subarray(offset, end));
    offset = end;
  }
  const original = Buffer.concat(chunks);
  const optimized = await optimizePngLosslessly(original);
  assert.ok(optimized.length < original.length);
  assert.deepEqual(await sharp(original).raw().toBuffer(), await sharp(optimized).raw().toBuffer());
  const meta = await sharp(optimized).metadata();
  assert.equal(meta.width, 600); assert.equal(meta.height, 400); assert.equal(meta.channels, 4); assert.equal(meta.density, 300);
});

test('an already small PNG never grows and remains pixel-identical', async () => {
  const original = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'navy' } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const optimized = await optimizePngLosslessly(original);
  assert.ok(optimized.length <= original.length);
  assert.deepEqual(await sharp(original).raw().toBuffer(), await sharp(optimized).raw().toBuffer());
});

test('higher-bit-depth, profiled, and non-PNG files retain their original bytes', async () => {
  const input = sharp({ create: { width: 20, height: 20, channels: 3, background: 'red' } });
  for (const original of [await input.clone().toColourspace('rgb16').png().toBuffer(), await input.clone().withIccProfile('p3').png().toBuffer(), await input.clone().jpeg().toBuffer(), Buffer.from('not an image')]) {
    assert.equal(await optimizePngLosslessly(original), original);
  }
});

test('caller cancellation stops optimization rather than uploading after its deadline', async () => {
  const reason = new Error('deadline');
  await assert.rejects(optimizePngLosslessly(Buffer.from('unused'), { signal: AbortSignal.abort(reason) }), reason);
});
