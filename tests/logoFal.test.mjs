import test from 'node:test';
import assert from 'node:assert/strict';
import { nanoLogoPlan, logoFalFailure } from '../src/lib/logoFal.mjs';
import { validateLogoOperation, logoOperationCost } from '../src/lib/logoStudio.mjs';
import { CREDIT_COST } from '../src/lib/pricing.js';
import { recraftLogoPlan } from '../src/lib/logoRecraft.mjs';

const input = changes => validateLogoOperation({ requestId: crypto.randomUUID(), prompt: 'A robot logo', ...changes });

test('provider failures distinguish content checks, unreadable inputs and absent output without leaking raw errors', () => {
  for (const [type, expected] of [
    ['content_policy_violation', /content check/], ['file_download_error', /upload it again/],
    ['image_too_large', /smaller image/], ['no_media_generated', /returned no logo image/],
  ]) {
    const failure = logoFalFailure({ status: 422, body: { detail: [{ type, msg: 'PRIVATE', input: 'PRIVATE' }] } }, 'Fallback');
    assert.match(failure.message, expected);
    assert.equal(failure.providerErrorCode, type); assert.equal(failure.providerStatus, 422);
    assert.doesNotMatch(JSON.stringify(failure), /PRIVATE/);
  }
  for (const detail of [undefined, 'PRIVATE', {}, [{ type: '__proto__', msg: 'PRIVATE' }]]) {
    assert.match(logoFalFailure({ status: 422, body: { detail } }, 'Fallback').message, /check your inputs/);
  }
  assert.equal(logoFalFailure(new Error('PRIVATE'), 'Fallback').message, 'Fallback');
});

test('the Nano adapter preserves the saved compiled prompt and seed', () => {
  const request = { ...input({ mode: 'sketch', sourceId: crypto.randomUUID() }), compiledPrompt: 'Keep this exact prepared direction', seed: 42 };
  const plan = nanoLogoPlan(request, 'reference');
  assert.equal(plan.input.prompt, request.compiledPrompt);
  assert.equal(plan.input.seed, 42);
});
test('selected Text styles use native Nano Banana 2.1 at fixed 1K without an artificial artboard', () => {
  const request = { ...input({ style: 'retro' }), compiledPrompt: 'An orange carrying a cup', seed: 0 };
  const plan = nanoLogoPlan(request);
  assert.equal(plan.endpoint, 'google/nano-banana-2.1'); assert.equal(plan.cost, null);
  assert.equal(plan.input.num_images, 1); assert.equal(plan.input.resolution, '1K');
  assert.equal(plan.input.output_format, 'png'); assert.equal(plan.input.image_urls, undefined);
  assert.equal(plan.input.prompt, request.compiledPrompt); assert.equal(plan.input.seed, 0);
  assert.equal(plan.input.thinking_level, 'medium');
  assert.throws(() => nanoLogoPlan(input()), /uses Recraft/);
  assert.equal(plan.input.limit_generations, true); assert.equal(plan.input.enable_web_search, false);
});

test('Nano style inspiration is required when selected and matching changes real prompt guidance', () => {
  const request = { ...input({ style: 'mascot', styleReferenceUrl: 'https://storage.test/style.png' }), compiledPrompt: 'A lynx', seed: 42 };
  const prompts = [];
  for (const styleMatch of ['flexible', 'precise']) {
    const plan = nanoLogoPlan({ ...request, generationOptions: { styleMatch } }, 'validated-reference');
    assert.equal(plan.endpoint, 'google/nano-banana-2.1/edit');
    assert.deepEqual(plan.input.image_urls, ['validated-reference']);
    assert.ok(plan.input.prompt.endsWith(request.compiledPrompt));
    assert.match(plan.input.prompt, /Do not copy its subject, composition, brand name/);
    assert.match(plan.input.prompt, styleMatch === 'precise' ? /contour rhythm/ : /loose influence/);
    assert.equal(plan.input.style_match, undefined); // No unsupported Recraft API controls.
    prompts.push(plan.input.prompt);
  }
  assert.notEqual(prompts[0], prompts[1]);
  assert.throws(() => nanoLogoPlan(request), /Style inspiration was not prepared/);
});
test('image, sketch, edit and variations pass their exact reference to the Nano edit endpoint', () => {
  for (const changes of [{ mode: 'image' }, { mode: 'sketch' }, { operation: 'edit' }, { operation: 'variations' }]) {
    const request = input({ sourceId: crypto.randomUUID(), ...changes });
    const reference = 'data:image/png;base64,reference';
    const plan = nanoLogoPlan(request, reference);
    assert.equal(plan.endpoint, 'google/nano-banana-2.1/edit');
    assert.equal(plan.model, 'nano-banana-2.1');
    assert.deepEqual(plan.input.image_urls, [reference]); assert.equal(plan.cost, null);
    assert.equal(plan.input.num_images, 1);
    assert.equal(plan.input.resolution, '1K'); assert.equal(plan.input.aspect_ratio, '1:1');
    assert.equal(plan.input.output_format, 'png');
    assert.equal(plan.input.limit_generations, true); assert.equal(plan.input.enable_web_search, false);
    assert.throws(() => nanoLogoPlan(request), /source image/);
  }
});
test('active Image/Sketch route pins Nano Banana 2.1 despite a historical Pro override', () => {
  const previous = process.env.LOGO_STUDIO_NANO_MODEL;
  process.env.LOGO_STUDIO_NANO_MODEL = 'pro';
  try {
    for (const mode of ['image', 'sketch']) {
      const plan = nanoLogoPlan(input({mode, sourceId: crypto.randomUUID()}), 'reference');
      assert.equal(plan.endpoint, 'google/nano-banana-2.1/edit'); assert.equal(plan.cost, null);
    }
  } finally {
    if (previous === undefined) delete process.env.LOGO_STUDIO_NANO_MODEL;
    else process.env.LOGO_STUDIO_NANO_MODEL = previous;
  }
});
test('Nano edit accepts a text instruction without requiring a Recraft mask', () => {
  const request = input({ operation: 'edit', sourceId: crypto.randomUUID(), prompt: 'Remove the star' });
  const plan = nanoLogoPlan(request, 'https://storage.test/logo.png');
  assert.match(plan.input.prompt, /Remove the star/); assert.equal(request.editArea, null);
  assert.equal(plan.input.mask_url, undefined);
});
test('Nano accepts longer image/edit briefs without obsolete Recraft limits', () => {
  assert.doesNotThrow(() => input({ mode: 'image', sourceId: crypto.randomUUID(), prompt: 'a'.repeat(1500) }));
  assert.doesNotThrow(() => input({ operation: 'edit', sourceId: crypto.randomUUID(), prompt: 'a'.repeat(1500) }));
});
test('support tools cannot accidentally submit to Nano; pricing stays isolated from other features', () => {
  for (const operation of ['removeBg', 'vectorize']) assert.throws(() => nanoLogoPlan({ operation }), /Recraft tool/);
  for (const mode of ['text', 'image', 'sketch']) assert.equal(logoOperationCost('generate', mode), 8);
  assert.equal(logoOperationCost('variations'), 6); assert.equal(logoOperationCost('edit'), 8);
  assert.equal(logoOperationCost('removeBg'), 2); assert.equal(logoOperationCost('vectorize'), 2);
  assert.equal(CREDIT_COST.removeBg, 2); assert.equal(CREDIT_COST.trace, 12); assert.equal(CREDIT_COST.upscale, 12);
});

test('Streetwear uses the existing text provider and one raster output without changing price', () => {
  const request = input({ style: 'streetwear-lettering', brand: 'Night Shift', prompt: '' });
  const plan = recraftLogoPlan(request);
  assert.equal(plan.endpoint, 'images/generations');
  assert.equal(plan.model, 'recraftv4_1');
  assert.equal(plan.body.n, 1);
  assert.equal(plan.body.image_format, 'png');
  assert.equal(plan.body.image_url, undefined);
  assert.throws(() => nanoLogoPlan(request, 'blank-artboard'), /Streetwear Lettering uses Recraft/);
  assert.equal(logoOperationCost('generate', request.mode), 8);
  assert.match(plan.body.prompt, /"Night Shift"/);
});
