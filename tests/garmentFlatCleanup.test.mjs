import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import {
  shouldCleanupGarmentFlat, buildGarmentFlatCleanupInput,
  assessGarmentCleanupLayout, refineGarmentFlatArtwork,
} from '../scripts/evals/experiments/garmentFlatCleanup.mjs';

const options = { flatImageUrl: 'https://fal.media/flat.png', referenceImageUrl: 'https://storage.test/source.jpg', mode: 'PRESERVE_LOGOS', aspectRatio: '3:4' };
async function fixture({ shadow = false, moved = false } = {}) {
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="384" height="512"><defs><linearGradient id="fold"><stop offset="0" stop-color="black" stop-opacity="0"/><stop offset=".5" stop-color="black" stop-opacity=".16"/><stop offset="1" stop-color="black" stop-opacity="0"/></linearGradient></defs><rect width="384" height="512" fill="#7236a8"/><path d="M20 80 Q200 140 350 80" stroke="#eeaaff" stroke-width="12" fill="none"/><g transform="translate(${moved ? 68 : 0} ${moved ? 90 : 0})"><text x="60" y="240" font-size="62" fill="white">PRINT</text><text x="125" y="320" font-size="60" fill="white">00</text><circle cx="70" cy="370" r="35" stroke="white" stroke-width="8" fill="none"/><path d="M160 370 L310 480 L180 470 Z" fill="#ff77cc"/></g>${shadow ? '<rect x="80" width="120" height="512" fill="url(#fold)"/>' : ''}</svg>`)).png().toBuffer();
}

test('surface cleanup is opt-in and restricted to garment extraction', () => {
  assert.equal(shouldCleanupGarmentFlat({ trace_type: 'mockup' }, {}), false);
  assert.equal(shouldCleanupGarmentFlat({ trace_type: 'mockup' }, { GARMENT_FLAT_CLEANUP_ENABLED: 'true' }), true);
  for (const trace_type of ['logo', 'universal', 'upscale']) assert.equal(shouldCleanupGarmentFlat({ trace_type }, { GARMENT_FLAT_CLEANUP_ENABLED: 'true' }), false);
});

test('the extracted artwork is the edit target and the photograph is secondary evidence', () => {
  const input = buildGarmentFlatCleanupInput(options);
  assert.deepEqual(input.image_urls, [options.flatImageUrl, options.referenceImageUrl]);
  assert.equal(input.aspect_ratio, '3:4');
  assert.equal(input.resolution, undefined);
  assert.equal(input.num_images, 1);
  assert.equal(buildGarmentFlatCleanupInput({ ...options, resolution: '2K' }).resolution, '2K');
  assert.throws(() => buildGarmentFlatCleanupInput({ ...options, flatImageUrl: '' }), /requires both/);
  assert.throws(() => buildGarmentFlatCleanupInput({ ...options, mode: 'LOGO_FLATTEN' }), /Unsupported/);
});

test('removing mild fold lighting can retain coarse print geometry without being certified as exact', async () => {
  const [shaded, flat] = await Promise.all([fixture({ shadow: true }), fixture()]);
  const review = await assessGarmentCleanupLayout(shaded, flat);
  assert.equal(review.layoutStable, true);
  assert.equal(review.reviewRequired, true);
  assert.equal(review.pass, undefined, 'The coarse guard is not a complete quality verdict.');
});

test('changed canvas, shifted artwork and nearly solid output are refused', async () => {
  const raw = await fixture();
  const wrongFrame = await sharp(raw).resize(384, 450).png().toBuffer();
  assert.equal((await assessGarmentCleanupLayout(raw, wrongFrame)).reason, 'frame_changed');
  assert.equal((await assessGarmentCleanupLayout(raw, await fixture({ moved: true }))).layoutStable, false);
  const solid = await sharp({ create: { width: 384, height: 512, channels: 3, background: '#7236a8' } }).png().toBuffer();
  assert.equal((await assessGarmentCleanupLayout(raw, solid)).layoutStable, false);
});

test('accepted cleanup returns actual provider bytes and records the extra attempt once', async () => {
  const [raw, cleaned] = await Promise.all([fixture({ shadow: true }), fixture()]);
  const usage = []; let calls = 0;
  const result = await refineGarmentFlatArtwork({ ...options, rawBuffer: raw,
    generate: async input => { calls++; assert.equal(input.image_urls[0], options.flatImageUrl); return { requestId: 'cleanup-request', data: { images: [{ url: 'https://fal.media/cleaned.png', content_type: 'image/png' }] } }; },
    download: async () => cleaned, onUsage: async receipt => usage.push(receipt),
  });
  assert.equal(calls, 1);
  assert.equal(result.buffer, cleaned);
  assert.equal(result.review.status, 'applied');
  assert.equal(usage.length, 1);
  assert.equal(usage[0].metadata.outcome, 'applied');
  assert.equal(usage[0].providerRequestId, 'cleanup-request');
});

test('a changed drawing keeps the original generated result, never the source photograph', async () => {
  const raw = await fixture(), changed = await fixture({ moved: true });
  const result = await refineGarmentFlatArtwork({ ...options, rawBuffer: raw,
    generate: async () => ({ requestId: 'drift', data: { images: [{ url: 'https://fal.media/drift.png' }] } }),
    download: async () => changed,
  });
  assert.equal(result.buffer, raw);
  assert.equal(result.review.status, 'rejected');
});

test('provider and transfer failures keep the paid extract without a second generation', async () => {
  const raw = await fixture();
  for (const failDownload of [false, true]) {
    let calls = 0; const usage = [];
    const result = await refineGarmentFlatArtwork({ ...options, rawBuffer: raw,
      generate: async () => { calls++; if (!failDownload) throw Object.assign(new Error('Provider unavailable'), { requestId: 'failed-job' }); return { requestId: 'download-job', data: { images: [{ url: 'https://fal.media/result.png' }] } }; },
      download: async () => { throw new Error('Transfer interrupted'); },
      onUsage: async receipt => usage.push(receipt),
    });
    assert.equal(calls, 1);
    assert.equal(result.buffer, raw);
    assert.equal(result.review.status, 'unavailable');
    assert.equal(usage.length, 1);
    assert.equal(usage[0].providerRequestId, failDownload ? 'download-job' : 'failed-job');
    assert.equal(usage[0].requestStatus, failDownload ? 'succeeded' : 'failed');
  }
});

test('invalid reference roles cannot start a provider request', async () => {
  const raw = await fixture(); let calls = 0, usage = 0;
  const result = await refineGarmentFlatArtwork({ ...options, referenceImageUrl: '', rawBuffer: raw,
    generate: async () => { calls++; }, onUsage: async () => { usage++; },
  });
  assert.equal(calls, 0); assert.equal(usage, 0);
  assert.equal(result.buffer, raw);
});
