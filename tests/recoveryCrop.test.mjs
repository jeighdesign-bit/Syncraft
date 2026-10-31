import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { recoveryCropRegion } from '../src/lib/recoveryCrop.mjs';
import { checkRecoveryCandidate } from '../src/lib/recoveryCandidate.mjs';

test('crop proposals cannot repair content loss or invalid coordinates', () => {
  const proposal = { pass: false, failures: ['background_present'], artwork_box: [100, 0, 900, 1000] };
  assert.deepEqual(recoveryCropRegion(proposal, 100, 200), { left: 10, top: 0, width: 80, height: 200 });
  for (const patch of [{ failures: ['invented_text'] }, { failures: ['missing_pattern'] }, { artwork_box: [900, 0, 100, 1000] }, { artwork_box: [-1, 0, 900, 1000] }, { artwork_box: [0, 0, 50, 50] }]) {
    assert.equal(recoveryCropRegion({ ...proposal, ...patch }, 100, 200), null);
  }
});

test('a proposed crop gets one independent visual check before acceptance', async () => {
  const image = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#245577' } }).png().toBuffer();
  let calls = 0;
  const result = await checkRecoveryCandidate({ sourceBuffer: image, outputBuffer: image, analysis: {}, mode: 'UNIVERSAL_KEEP_ARTWORK', inspect: async (_images, _prompt, options) => {
    assert.equal(options.imageLayout, 'source_image');
    calls++;
    return calls === 1 ? { pass: false, failures: ['background_present'], artwork_box: [100, 0, 900, 1000] } : { pass: true, failures: [] };
  } });
  assert.equal(calls, 2); assert.equal(result.validation.pass, true);
  assert.equal((await sharp(result.buffer).metadata()).width, 80);
});

test('a rejected crop remains rejected and never starts a crop loop', async () => {
  const image = await sharp({ create: { width: 100, height: 200, channels: 3, background: '#245577' } }).png().toBuffer();
  let calls = 0;
  const result = await checkRecoveryCandidate({ sourceBuffer: image, outputBuffer: image, analysis: {}, inspect: async () => {
    calls++; return { pass: false, failures: ['background_present'], artwork_box: [100, 0, 900, 1000] };
  } });
  assert.equal(calls, 2); assert.equal(result.validation.pass, false);
});

test('narrow source and output are inspected as full-frame images without sheet cells or padding', async () => {
  const source = await sharp({ create: { width: 44, height: 749, channels: 3, background: '#246733' } }).png().toBuffer();
  const output = await sharp(source).resize(264, 4494).png().toBuffer();
  const result = await checkRecoveryCandidate({ sourceBuffer: source, outputBuffer: output, analysis: {}, allowCrop: false,
    inspect: async (images, prompt, options) => {
      assert.equal(options.imageLayout, 'source_image');
      const metadata = await Promise.all(images.map(url => sharp(Buffer.from(url.split(',')[1], 'base64')).metadata()));
      assert.equal(metadata[0].width, 44); assert.equal(metadata[0].height, 749);
      assert.equal(metadata[1].height, 2000); assert.ok(Math.abs(metadata[1].width / metadata[1].height - 44 / 749) < 0.001);
      assert.match(prompt, /actual unpadded full-frame images/);
      assert.doesNotMatch(prompt, /first cell is full overview/);
      return { pass: true, failures: [] };
    } });
  assert.equal(result.calls, 1); assert.ok(result.buffer.equals(output));
});

test('a false passing visual verdict cannot approve large blank fields around a physical lanyard', async () => {
  const width = 100, height = 400, pixels = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) for (let x = 30; x < 70; x++) {
    const offset = (y * width + x) * 3;
    const color = y % 31 < 14 ? [220, 170, 20] : [5, 8, 10];
    for (let c = 0; c < 3; c++) pixels[offset + c] = color[c];
  }
  const output = await sharp(pixels, { raw: { width, height, channels: 3 } }).png().toBuffer();
  const inspect = async () => ({ pass: true, failures: [], artwork_box: [300, 0, 700, 1000],
    checks: { geometry: 'pass', content: 'pass', lettering: 'unverifiable' } });
  const options = { sourceBuffer: output, outputBuffer: output, mode: 'UNIVERSAL_KEEP_ARTWORK',
    analysis: { reference_category: 'lanyard', presentation_type: 'physical_surface' }, inspect };
  const result = await checkRecoveryCandidate(options);
  assert.equal(result.validation.pass, false); assert.deepEqual(result.validation.failures, ['wrong_layout']);
  assert.equal(result.validation.checks.geometry, 'fail'); assert.equal(result.validation.checks.lettering, 'unverifiable');
  assert.equal(result.validation.advisory_diagnostics.strip_exterior.suspected_exterior, true);
  assert.equal(result.validation.artwork_box, null); assert.equal(result.cropped, false); assert.equal(result.calls, 1);
  assert.ok(result.buffer.equals(output));
  const digital = await checkRecoveryCandidate({ ...options, analysis: { ...options.analysis, presentation_type: 'digital_artwork' } });
  assert.equal(digital.validation.pass, true); assert.ok(digital.buffer.equals(output));
});
