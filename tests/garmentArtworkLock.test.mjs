import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { normalizeGarmentArtworkMask, renderGarmentArtworkMask, lockGarmentArtwork,
  buildGarmentLockedFillInput, fillGarmentGapsFromSource } from '../scripts/evals/experiments/garmentArtworkLock.mjs';

const rawPlan = () => ({ confidence: 0.95, view_count: 1, front_facing: true,
  torso_polygon: [[100, 0], [900, 0], [1000, 1000], [0, 1000]],
  construction_polygons: [[[400, 0], [600, 0], [500, 100]]],
  identity_polygons: [{ label: 'number', polygon: [[400, 400], [600, 400], [600, 600], [400, 600]] }],
});
async function sourceFixture() {
  const data = Buffer.alloc(64 * 96 * 3);
  for (let i = 0; i < data.length; i++) data[i] = (i * 37 + 19) % 256;
  return sharp(data, { raw: { width: 64, height: 96, channels: 3 } }).png().toBuffer();
}

test('hostile fill pixels cannot alter a single source-locked RGB pixel', async () => {
  const sourceBuffer = await sourceFixture();
  const fillBuffer = await sharp({ create: { width: 128, height: 192, channels: 3, background: '#ff00ff' } }).png().toBuffer();
  const mask = normalizeGarmentArtworkMask(rawPlan(), 'ERASE_LOGOS');
  const result = await lockGarmentArtwork({ sourceBuffer, fillBuffer, mask, mode: 'ERASE_LOGOS' });
  const [expected, actual, edit] = await Promise.all([
    sharp(sourceBuffer).resize(128, 192, { fit: 'fill' }).removeAlpha().toColourspace('srgb').raw().toBuffer(),
    sharp(result.buffer).raw().toBuffer(), renderGarmentArtworkMask(mask, 128, 192),
  ]);
  let protectedCount = 0, changedCount = 0;
  for (let i = 0; i < edit.length; i++) {
    if (edit[i]) { assert.deepEqual([...actual.subarray(i * 3, i * 3 + 3)], [255, 0, 255]); changedCount++; }
    else { assert.deepEqual(actual.subarray(i * 3, i * 3 + 3), expected.subarray(i * 3, i * 3 + 3)); protectedCount++; }
  }
  assert.ok(protectedCount > 0 && changedCount > 0);
  assert.equal(result.review.reviewRequired, true);
  assert.ok(result.review.limitations.includes('source_folds_and_photographic_shading_retained'));
});

test('preserve mode cannot erase identity ink even when an analysis proposes removal', async () => {
  const sourceBuffer = await sourceFixture();
  const fillBuffer = await sharp({ create: { width: 64, height: 96, channels: 3, background: '#fff' } }).png().toBuffer();
  const mask = normalizeGarmentArtworkMask(rawPlan(), 'ERASE_LOGOS');
  const result = await lockGarmentArtwork({ sourceBuffer, fillBuffer, mask, mode: 'PRESERVE_LOGOS' });
  const [source, actual] = await Promise.all([sharp(sourceBuffer).raw().toBuffer(), sharp(result.buffer).raw().toBuffer()]);
  const middle = (48 * 64 + 32) * 3;
  assert.deepEqual(actual.subarray(middle, middle + 3), source.subarray(middle, middle + 3));
  assert.deepEqual(normalizeGarmentArtworkMask(rawPlan(), 'PRESERVE_LOGOS').identity_polygons, []);
});

test('ambiguous multi-view, perspective and malformed or broad masks are refused', () => {
  for (const patch of [{ confidence: 0.8 }, { view_count: 2 }, { front_facing: false }, { torso_polygon: [[0, 0], [10, 0], [0, 10]] },
    { construction_polygons: [[[0, 0], [1001, 0], [500, 500]]] },
    { identity_polygons: [{ polygon: [[0, 0], [1000, 0], [1000, 1000], [0, 1000]] }] }]) {
    assert.throws(() => normalizeGarmentArtworkMask({ ...rawPlan(), ...patch }, 'ERASE_LOGOS'));
  }
  assert.throws(() => normalizeGarmentArtworkMask(rawPlan(), 'UNKNOWN'), /Unsupported/);
});

test('combined removal coverage is bounded even when individual polygons are allowed', async () => {
  const raw = rawPlan();
  raw.construction_polygons = Array.from({ length: 5 }, (_, i) => [[i * 200, 0], [i * 200 + 190, 0], [i * 200 + 190, 1000], [i * 200, 1000]]);
  const mask = normalizeGarmentArtworkMask(raw, 'PRESERVE_LOGOS');
  const bytes = await sourceFixture();
  await assert.rejects(() => lockGarmentArtwork({ sourceBuffer: bytes, fillBuffer: bytes, mask, mode: 'PRESERVE_LOGOS' }), /too much/);
});

test('fill requests retain the source, selected ratio/tier and selected content mode', () => {
  const mask = normalizeGarmentArtworkMask(rawPlan(), 'ERASE_LOGOS');
  const input = buildGarmentLockedFillInput({ imageUrl: 'https://storage.test/source.jpg', mode: 'PRESERVE_LOGOS', aspectRatio: '9:16', resolution: '2K', mask });
  assert.deepEqual(input.image_urls, ['https://storage.test/source.jpg']);
  assert.equal(input.aspect_ratio, '9:16');
  assert.equal(input.resolution, '2K');
  assert.ok(!input.prompt.includes('"label":"number"'));
  assert.throws(() => buildGarmentLockedFillInput({ imageUrl: '', mode: 'ERASE_LOGOS', resolution: '2K', mask }));
});

test('reviewed development masks retain their real uncertainty and cannot bypass view checks', () => {
  const uncertain = { ...rawPlan(), confidence: 0.86 };
  assert.throws(() => normalizeGarmentArtworkMask(uncertain, 'ERASE_LOGOS'));
  const reviewed = normalizeGarmentArtworkMask(uncertain, 'ERASE_LOGOS', { reviewed: true });
  assert.equal(reviewed.confidence, 0.86);
  assert.equal(reviewed.reviewed, true);
  assert.equal(reviewed.reviewRequired, true);
  assert.throws(() => normalizeGarmentArtworkMask({ ...uncertain, view_count: 2 }, 'ERASE_LOGOS', { reviewed: true }));
});

test('source-color fills also preserve locked pixels and explicitly cannot recover hidden illustration', async () => {
  const sourceBuffer = await sourceFixture();
  const mask = normalizeGarmentArtworkMask(rawPlan(), 'ERASE_LOGOS');
  const result = await fillGarmentGapsFromSource({ sourceBuffer, mask, mode: 'ERASE_LOGOS' });
  const [source, output, edit] = await Promise.all([sharp(sourceBuffer).raw().toBuffer(), sharp(result.buffer).raw().toBuffer(), renderGarmentArtworkMask(mask, 64, 96)]);
  for (let i = 0; i < edit.length; i++) if (!edit[i]) assert.deepEqual(output.subarray(i * 3, i * 3 + 3), source.subarray(i * 3, i * 3 + 3));
  assert.ok(result.review.limitations.includes('removed_marks_have_smooth_fills_not_recovered_illustration'));
});
