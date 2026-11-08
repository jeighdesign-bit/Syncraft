import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLogoGenerationOptions, logoGenerationOptionsFromDraft, LOGO_MAX_SEED } from '../src/lib/logoGenerationOptions.mjs';
import { validateLogoOperation, publicLogoProject, logoStudioAssetUrls } from '../src/lib/logoStudio.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { logoReviewContext } from '../src/lib/logoReview.mjs';

const input = changes => validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text', style: 'mascot', prompt: 'A curious otter holding a coffee cup', brand: 'RIVERDAY', palette: [], ...changes });

test('generation options accept only supported values and unsigned integer seeds, including zero', () => {
  for (const seed of [0, 42, LOGO_MAX_SEED]) assert.deepEqual(normalizeLogoGenerationOptions({ conceptMode: 'faithful', styleMatch: 'precise', seed }), { conceptMode: 'faithful', styleMatch: 'precise', seed });
  for (const value of [[], '', { model: 'other' }, { conceptMode: 'random' }, { styleMatch: 'strong' }, ...[-1, 0.5, LOGO_MAX_SEED + 1, '42', NaN, Infinity].map(seed => ({ seed }))]) assert.throws(() => normalizeLogoGenerationOptions(value));
  assert.deepEqual(normalizeLogoGenerationOptions(), {});
  assert.deepEqual(logoGenerationOptionsFromDraft({ seed: '', conceptMode: 'explore' }), { conceptMode: 'explore' });
  assert.deepEqual(logoGenerationOptionsFromDraft({ seed: '000' }), { seed: 0 });
  for (const seed of ['1e3', '-1', ' 12', '1.1', '4294967296']) assert.throws(() => logoGenerationOptionsFromDraft({ seed }));
});

test('style inspiration and generation controls are creation-only, Text-only and retain short user wording', () => {
  const result = input({ generationOptions: { seed: 0, conceptMode: 'faithful' }, styleReferenceUrl: 'https://storage.test/style.png' });
  assert.equal(result.prompt, 'A curious otter holding a coffee cup'); assert.equal(result.brand, 'RIVERDAY');
  for (const changes of [{ mode: 'image' }, { mode: 'sketch' }, { operation: 'edit' }, { operation: 'variations' }]) {
    assert.throws(() => input({ ...changes, sourceId: crypto.randomUUID(), generationOptions: { seed: 0 } }), /Text to Logo/);
    assert.throws(() => input({ ...changes, sourceId: crypto.randomUUID(), styleReferenceUrl: 'https://storage.test/style.png' }), /Text to Logo/);
  }
  for (const url of ['http://storage.test/style.png', 'file:///secret', 123]) assert.throws(() => input({ styleReferenceUrl: url }));
});

test('Follow brief keeps identical composition instructions across every style without rewriting the idea', () => {
  for (const style of ['minimalist', 'mascot', 'badge', 'pictorial', 'streetwear-lettering']) {
    const faithful = normalizeLogoBrief(input({ style, generationOptions: { conceptMode: 'faithful' } }));
    const directions = fallbackLogoDirections(faithful, 4);
    assert.ok(directions.every(direction => direction.preserveBrief));
    const prompts = directions.map(direction => compileLogoDirection(faithful, direction));
    assert.equal(new Set(prompts).size, 1, style);
    assert.ok(prompts.every(prompt => prompt.includes(faithful.rawBrief) && prompt.includes('RIVERDAY')));
    const explore = normalizeLogoBrief(input({ style }));
    assert.ok(new Set(fallbackLogoDirections(explore, 4).map(direction => compileLogoDirection(explore, direction))).size > 1, style);
  }
});

test('saved recipes expose usable settings and output seed without leaking the private style asset', () => {
  const job = { ...input({ generationOptions: { seed: 42, conceptMode: 'faithful', styleMatch: 'precise' }, styleReferenceUrl: 'https://storage.test/private-style.png' }), id: crypto.randomUUID(), seed: 43, status: 'succeeded', url: 'https://storage.test/result.png' };
  const project = { id: crypto.randomUUID(), canvas_data: { tool: 'logo_studio', jobs: [job] } };
  const result = publicLogoProject(project).jobs[0];
  assert.deepEqual(result.generationOptions, job.generationOptions); assert.equal(result.effectiveSeed, 43); assert.equal(result.hasStyleReference, true);
  assert.ok(!JSON.stringify(result).includes('private-style'));
  assert.ok(logoStudioAssetUrls(project.canvas_data).includes(job.styleReferenceUrl));
  const edit = { id: crypto.randomUUID(), operation: 'edit', sourceId: result.id, status: 'succeeded', url: 'https://storage.test/edit.png' };
  const context = logoReviewContext(edit, [result, edit]);
  assert.equal(context.hasStyleReference, true); assert.equal(context.effectiveSeed, 43); assert.deepEqual(context.generationOptions, job.generationOptions);
});
