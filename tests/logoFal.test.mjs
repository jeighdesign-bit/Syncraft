import test from 'node:test';
import assert from 'node:assert/strict';
import { nanoLogoPlan } from '../src/lib/logoFal.mjs';
import { validateLogoOperation, logoOperationCost } from '../src/lib/logoStudio.mjs';
import { CREDIT_COST } from '../src/lib/pricing.js';

const input = changes => validateLogoOperation({ requestId: crypto.randomUUID(), prompt: 'A robot logo', ...changes });
test('text creation uses Nano Banana 2 at fixed 1K and one output', () => {
  const plan = nanoLogoPlan(input());
  assert.equal(plan.endpoint, 'fal-ai/nano-banana-2'); assert.equal(plan.cost, 0.08);
  assert.equal(plan.input.num_images, 1); assert.equal(plan.input.resolution, '1K');
  assert.equal(plan.input.output_format, 'png'); assert.equal(plan.input.image_urls, undefined);
  assert.equal(plan.input.limit_generations, true); assert.equal(plan.input.enable_web_search, false);
});
test('image, sketch, edit and variations pass their exact reference to the Nano edit endpoint', () => {
  for (const changes of [{ mode: 'image' }, { mode: 'sketch' }, { operation: 'edit' }, { operation: 'variations' }]) {
    const request = input({ sourceId: crypto.randomUUID(), ...changes });
    const reference = 'data:image/png;base64,reference';
    const plan = nanoLogoPlan(request, reference);
    assert.equal(plan.endpoint, 'fal-ai/nano-banana-2/edit');
    assert.deepEqual(plan.input.image_urls, [reference]); assert.equal(plan.cost, 0.08);
    assert.equal(plan.input.num_images, 1);
    assert.throws(() => nanoLogoPlan(request), /source image/);
  }
});
test('Nano Banana Pro remains available as an explicit server setting', () => {
  const previous = process.env.LOGO_STUDIO_NANO_MODEL;
  try {
    process.env.LOGO_STUDIO_NANO_MODEL = 'pro';
    const plan = nanoLogoPlan(input());
    assert.equal(plan.endpoint, 'fal-ai/nano-banana-pro');
    assert.equal(plan.model, 'nano-banana-pro');
    assert.equal(plan.cost, 0.15);
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
  assert.equal(logoOperationCost('variations'), 8); assert.equal(logoOperationCost('edit'), 8);
  assert.equal(logoOperationCost('removeBg'), 2); assert.equal(logoOperationCost('vectorize'), 2);
  assert.equal(CREDIT_COST.removeBg, 12); assert.equal(CREDIT_COST.trace, 12); assert.equal(CREDIT_COST.upscale, 12);
});
