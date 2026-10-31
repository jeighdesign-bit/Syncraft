import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { inspectRecoveryImages, normalizeVisualValidation, buildRecoveryImageInput, surfaceAnalysisPrompt, visualRecoveryPrompt, RECOVERY_DIRECT_CROP_PROMPT_VERSION } from '../src/lib/recoveryVision.mjs';
import { recoveryVisionImage } from '../src/lib/recoveryVisionImage.mjs';

test('carrier or missing artwork always rejects, even when usable_partial is suggested', () => {
  for (const failure of ['carrier_present', 'background_present', 'missing_visible_artwork', 'foreground_artwork_remains']) {
    const result = normalizeVisualValidation({ pass: false, usable_partial: true, failures: [failure] });
    assert.equal(result.pass, false); assert.equal(result.usable_partial, false);
  }
});
test('invalid, contradictory and unrecognized verdicts fail closed', () => {
  for (const raw of [{ pass: true, failures: ['carrier_present'] }, { pass: false, failures: [] }, { pass: true }, { pass: true, failures: ['unknown'] }]) {
    assert.throws(() => normalizeVisualValidation(raw));
  }
});
test('visual provider preserves source/output order and records usage before JSON validation', async () => {
  let usage, request;
  await assert.rejects(inspectRecoveryImages(['source', 'output'], 'check', {
    env: { FAL_KEY: 'test' }, onUsage: async data => { usage = data; },
    fetchImpl: async (url, init) => { request = JSON.parse(init.body); return new Response(JSON.stringify({ output: 'bad-json', usage: { cost: 0.01 } })); },
  }));
  assert.deepEqual(request.image_urls, ['source', 'output']); assert.equal(usage.usage.cost, 0.01);
});
test('provider outage does not become a passing validation', async () => {
  await assert.rejects(inspectRecoveryImages(['source'], 'check', { env: { FAL_KEY: 'test' }, fetchImpl: async () => new Response('', { status: 503 }) }), /unavailable/);
});

test('source coordinates and inspection-sheet coordinates have explicit separate system contexts', async () => {
  const requests = [];
  const options = { env: { FAL_KEY: 'test' }, fetchImpl: async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ output: '{}' }));
  } };
  await inspectRecoveryImages(['source'], 'analyze', options);
  await inspectRecoveryImages(['sheet'], 'review', { ...options, imageLayout: 'inspection_sheet' });
  assert.match(requests[0].system_prompt, /actual unpadded full-frame image/);
  assert.match(requests[0].system_prompt, /full width and height/);
  assert.doesNotMatch(requests[0].system_prompt, /four ordered detail crops/);
  assert.match(requests[1].system_prompt, /four ordered detail crops/);
  assert.match(requests[1].system_prompt, /not sheet coordinates/);
  await assert.rejects(inspectRecoveryImages(['source'], 'analyze', { ...options, imageLayout: 'unknown' }), /Invalid recovery inspection image layout/);
  assert.equal(requests.length, 2);
});
test('narrow references expose overview and four readable ordered detail crops', async () => {
  const buffer = await sharp({ create: { width: 44, height: 749, channels: 3, background: '#126733' } }).png().toBuffer();
  const data = await recoveryVisionImage(buffer);
  const meta = await sharp(Buffer.from(data.split(',')[1], 'base64')).metadata();
  assert.equal(meta.width, 2560); assert.equal(meta.height, 512);
});
test('extraction uses the actual image edit reference and preserves selected removal mode', () => {
  const input = buildRecoveryImageInput({ imageUrls: ['reference'], analysis: { aspect_ratio: 'auto', surface_description: 'front label only' }, mode: 'UNIVERSAL_BACKGROUND_ONLY' });
  assert.deepEqual(input.image_urls, ['reference']); assert.match(input.prompt, /front label only/); assert.match(input.prompt, /EXTRACT PATTERN ONLY/);
});

test('observed lettering is bounded reference evidence only in keep-artwork mode', () => {
  const analysis = { readable_text: ['  CAHS  ', null, 'x'.repeat(500), ...Array.from({ length: 20 }, (_, i) => `label ${i}`)] };
  const keep = buildRecoveryImageInput({ imageUrls: ['reference'], analysis, mode: 'UNIVERSAL_KEEP_ARTWORK' });
  const textLine = keep.prompt.split('\n').find(line => line.startsWith('Observed readable source text'));
  const observed = JSON.parse(textLine.slice(textLine.indexOf('['), textLine.lastIndexOf(']') + 1));
  assert.equal(observed[0], 'CAHS'); assert.equal(observed[1].length, 160); assert.equal(observed.length, 12);
  assert.match(keep.prompt, /do not re-typeset, correct spelling, translate/);
  const pattern = buildRecoveryImageInput({ imageUrls: ['reference'], analysis, mode: 'UNIVERSAL_BACKGROUND_ONLY' });
  assert.doesNotMatch(pattern.prompt, /Observed readable source text/);
});

test('direct user crop ignores stale analyzed targets and transcription while keeping the exact input and local aspect', () => {
  const imageUrls = ['https://storage.test/exact-user-crop.png'];
  const stale = { reference_category: 'packaging', aspect_ratio: '3:4',
    surface_description: 'WRONG_ALTERNATE_PANEL', readable_text: ['WRONG_TRANSCRIPTION'],
    print_quad: [[111, 222], [999, 222], [999, 888], [111, 888]], source_width: 367, source_height: 494 };
  const input = buildRecoveryImageInput({ imageUrls, analysis: stale, mode: 'UNIVERSAL_KEEP_ARTWORK', directCrop: true });
  assert.strictEqual(input.image_urls, imageUrls); assert.equal(input.aspect_ratio, '3:4'); assert.equal(input.num_images, 1);
  assert.match(input.prompt, new RegExp(RECOVERY_DIRECT_CROP_PROMPT_VERSION));
  assert.match(input.prompt, /user crop is the authoritative content extent/);
  assert.match(input.prompt, /printed headers.*seal-band artwork/);
  assert.match(input.prompt, /Do not generate two packages/);
  assert.doesNotMatch(input.prompt, /WRONG_ALTERNATE_PANEL|WRONG_TRANSCRIPTION|111|222|print_quad|TARGET PRINT SURFACE|Observed readable source text/);
  const clean = buildRecoveryImageInput({ imageUrls, analysis: { reference_category: 'packaging', aspect_ratio: '3:4' }, mode: 'UNIVERSAL_KEEP_ARTWORK', directCrop: true });
  assert.deepEqual(input, clean);
});

test('direct crop retains category guidance and selected extraction mode without analyzed region selection', () => {
  const input = buildRecoveryImageInput({ imageUrls: ['exact-crop'], analysis: { reference_category: 'lanyard' }, mode: 'UNIVERSAL_BACKGROUND_ONLY', directCrop: true });
  assert.equal(input.aspect_ratio, 'auto'); assert.match(input.prompt, /REFERENCE CATEGORY GUIDE: Lanyard/);
  assert.match(input.prompt, /EXTRACT PATTERN ONLY/); assert.match(input.prompt, /straighten the cropped visible ribbon/);
  assert.doesNotMatch(input.prompt, /TARGET PRINT SURFACE|dominant visible|dominant readable/);
  const legacy = buildRecoveryImageInput({ imageUrls: ['reference'], analysis: { surface_description: 'LEGACY_SELECTED_TARGET' }, mode: 'UNIVERSAL_KEEP_ARTWORK' });
  assert.match(legacy.prompt, /LEGACY_SELECTED_TARGET/); assert.doesNotMatch(legacy.prompt, /DIRECT USER CROP/);
});

test('flat-source eligibility requires explicit geometry evidence rather than text readability', () => {
  const prompt = surfaceAnalysisPrompt('lanyard');
  for (const field of ['presentation_type', 'already_flat', 'single_surface', 'geometry_confidence', 'occlusion', 'readable_text']) assert.ok(prompt.includes(field));
  assert.match(prompt, /Unknown evidence is not none/);
  assert.match(prompt, /four supported corners/);
  assert.match(prompt, /ENTIRE supplied image is already one front-facing artwork canvas/);
});

test('visual details distinguish flat geometry from preserved content and uncertain lettering', () => {
  const source = { pass: true, failures: [], checks: { geometry: 'pass', content: 'pass', lettering: 'unverifiable' } };
  assert.deepEqual(normalizeVisualValidation(source).checks, source.checks);
  assert.throws(() => normalizeVisualValidation({ ...source, checks: { ...source.checks, geometry: 'fail' } }), /inconsistent detail/);
  assert.throws(() => normalizeVisualValidation({ ...source, checks: { content: 'pass' } }), /inconsistent detail/);
  const failing = normalizeVisualValidation({ pass: false, failures: ['carrier_present'], checks: { geometry: 'fail', content: 'pass', lettering: 'unverifiable' } });
  assert.equal(failing.pass, false); assert.equal(failing.checks.content, 'pass');
  const prompt = visualRecoveryPrompt({ reference_category: 'poster' }, 'UNIVERSAL_KEEP_ARTWORK');
  assert.match(prompt, /sharper tilted panel/);
  assert.match(prompt, /missing small logos/);
  assert.match(prompt, /unverifiable lettering check is not proof/);
});
