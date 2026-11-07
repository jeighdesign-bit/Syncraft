import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLogoOperation, buildLogoPrompt } from '../src/lib/logoStudio.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection, LOGO_COMPILER_VERSION } from '../src/lib/logoPromptCompiler.mjs';
import { recraftLogoPlan } from '../src/lib/logoRecraft.mjs';
import { generateRecraftLogo } from '../src/lib/logoRecraftServer.js';

const horse = overrides => validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text',
  style: 'abstract', brand: '', tagline: '', palette: [],
  prompt: 'A white horse standing in profile view, facing left, with a long flowing tail.',
  designSettings: { detail: 'minimal', structure: 'geometric' }, ...overrides });

test('white subject with automatic background keeps contrast, pose and geometric construction in both prompt paths', () => {
  const input = horse();
  const brief = normalizeLogoBrief(input);
  const compiled = compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]);
  assert.equal(compiled, buildLogoPrompt(input));
  assert.ok(compiled.includes(input.prompt));
  assert.match(compiled, /Auto background:.*#111820/);
  assert.doesNotMatch(compiled, /otherwise use a plain white background/);
  assert.match(compiled, /Preserve the requested foreground color/);
  assert.match(compiled, /facing direction/);
  assert.match(compiled, /Do not mirror/);
  assert.match(compiled, /Do not invent alphabetic glyphs/);
  assert.match(compiled, /construction must shape the subject itself/);
  assert.deepEqual(recraftLogoPlan(input).body.controls, { background_color: { rgb: [17, 24, 32] } });
});

test('explicit background controls retain their exact native color and bypass automatic background selection', () => {
  const input = horse({ designSettings: { detail: 'minimal', structure: 'geometric', backgroundColor: '#08182C', primaryColor: '#FFFFFF' } });
  const plan = recraftLogoPlan(input);
  assert.match(plan.body.prompt, /Use exactly #08182C as the flat background/);
  assert.doesNotMatch(plan.body.prompt, /prefer white for dark foregrounds/);
  assert.deepEqual(plan.body.controls, { colors: [{ rgb: [255, 255, 255] }], background_color: { rgb: [8, 24, 44] } });
});

test('requested enclosures, curves and white backgrounds remain in the brief; Streetwear keeps its own default', () => {
  const input = horse({ prompt: 'A curved white horse inside a circular emblem on a white background.' });
  const prompt = buildLogoPrompt(input);
  assert.ok(prompt.includes(input.prompt));
  assert.match(prompt, /Follow any background specified in the brief/);
  assert.match(prompt, /preserve explicitly requested curves/);
  assert.match(prompt, /Use a letterform or enclosure only when explicitly requested/);
  const lettering = buildLogoPrompt(horse({ style: 'streetwear-lettering', brand: 'FORMA', prompt: '' }));
  assert.doesNotMatch(lettering, /dark background for a white|Do not invent alphabetic glyphs/);
});

test('provider adapter transmits the corrected horse contract without adding brand text, changing model or making retries', async () => {
  const previous = process.env.RECRAFT_API_TOKEN;
  process.env.RECRAFT_API_TOKEN = 'test-only';
  let calls = 0;
  try {
    const input = horse();
    const brief = normalizeLogoBrief(input);
    const compiledPrompt = compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]);
    await generateRecraftLogo({ ...input, compiledPrompt, compilerVersion: LOGO_COMPILER_VERSION, seed: 42 }, undefined, undefined, { request: async (url, options) => {
      calls++;
      const body = JSON.parse(options.body);
      assert.equal(url, 'https://external.api.recraft.ai/v1/images/generations');
      assert.equal(body.model, 'recraftv4_1');
      assert.equal(body.prompt, compiledPrompt);
      assert.equal(body.n, 1);
      assert.match(body.prompt, /A white horse standing in profile view, facing left/);
      assert.doesNotMatch(body.prompt, /The exact brand name is/);
      assert.deepEqual(body.controls?.background_color, { rgb: [17, 24, 32] });
      return { ok: true, headers: new Headers(), json: async () => ({ data: [{ url: 'https://img.recraft.ai/test.png', image_id: 'mock-output' }] }) };
    } });
    assert.equal(calls, 1);
  } finally {
    if (previous === undefined) delete process.env.RECRAFT_API_TOKEN;
    else process.env.RECRAFT_API_TOKEN = previous;
  }
});
