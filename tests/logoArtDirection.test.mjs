import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLogoBrief, fallbackLogoDirections, validateLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { planLogoDirections } from '../src/lib/logoArtDirectorServer.js';
import { LOGO_STYLE_PROFILES } from '../src/lib/logoStyleProfiles.mjs';
const request = { operation: 'generate', mode: 'text', style: 'wordmark', prompt: 'Cracked piggy bank and coins integrated into lettering', brand: 'TIP YOUR BARBER', tagline: 'Fresh Cuts', palette: ['#123456'] };
test('all 12 profiles compile distinct options without dropping authoritative content', () => {
  assert.equal(Object.keys(LOGO_STYLE_PROFILES).length, 12);
  for (const style of Object.keys(LOGO_STYLE_PROFILES)) {
    const brief = normalizeLogoBrief({ ...request, style });
    const prompts = fallbackLogoDirections(brief, 4).map(d => compileLogoDirection(brief, d));
    assert.equal(new Set(prompts).size, 4);
    for (const prompt of prompts) { assert.ok(prompt.includes(request.prompt)); assert.ok(prompt.includes(request.brand)); assert.ok(prompt.includes(request.tagline)); assert.ok(prompt.includes('#123456')); }
  }
  for (const mode of ['image', 'sketch']) assert.throws(() => normalizeLogoBrief({ ...request, mode }));
});
test('planner validation rejects changed names, duplicates and arbitrary URLs', () => {
  const b = normalizeLogoBrief(request), d = fallbackLogoDirections(b, 2), valid = { ...b, directions: d };
  assert.equal(validateLogoDirections(valid, b, 2).length, 2);
  for (const invalid of [{ ...valid, brand: 'WRONG' }, { ...valid, directions: [d[0], d[0]] }, { ...valid, directions: [{ ...d[0], construction: 'https://bad.test' }, d[1]] }]) assert.throws(() => validateLogoDirections(invalid, b, 2));
});
test('planner has a no-network fallback and a validated AI path with usage metadata', async () => {
  const fallback = await planLogoDirections(request, 2, { env: {}, fetchImpl: () => { throw new Error('must not call'); } });
  assert.equal(fallback.metadata.mode, 'fallback');
  const env = { FAL_KEY: 'test-key', LOGO_PLANNER_MODEL: 'qwen/qwen3-30b-a3b-instruct-2507' };
  const ai = await planLogoDirections(request, 2, { env, fetchImpl: async (url, args) => {
    assert.equal(url, 'https://fal.run/openrouter/router');
    assert.equal(args.headers.Authorization, 'Key test-key');
    assert.ok(args.signal);
    const body = JSON.parse(args.body);
    assert.equal(body.model, env.LOGO_PLANNER_MODEL);
    assert.equal(body.enable_web_search, false);
    assert.equal(body.reasoning, false);
    assert.equal(body.max_tokens, 3000);
    assert.equal(JSON.parse(body.prompt).responseShape.directions.length, 2);
    return { ok: true, json: async () => ({ output: JSON.stringify({ ...fallback.brief, directions: fallback.directions }), usage: { total_tokens: 50, cost: 0.001 } }) };
  } });
  assert.equal(ai.metadata.mode, 'ai'); assert.equal(ai.metadata.usage.total_tokens, 50);
  assert.equal(ai.metadata.usage.cost, 0.001);
  assert.equal(ai.metadata.provider, 'fal');
  assert.equal(ai.metadata.endpoint, 'openrouter/router');
  for (const fetchImpl of [async () => { throw new Error('timeout'); }, async () => ({ ok: false, status: 402 }), async () => ({ ok: true, json: async () => ({ output: '' }) })]) {
    const result = await planLogoDirections(request, 2, { env, fetchImpl }); assert.equal(result.metadata.mode, 'fallback');
    assert.equal(result.metadata.provider, 'fal');
  }
});

test('Google credentials never authorize the planner and the fal model has a default', async () => {
  const result = await planLogoDirections(request, 1, { env: { GOOGLE_API_KEY: 'unused', GEMINI_API_KEY: 'unused', LOGO_PLANNER_API_KEY: 'unused' }, fetchImpl: () => assert.fail('Google credentials must not trigger a call') });
  assert.equal(result.metadata.reason, 'not-configured');
  await planLogoDirections(request, 1, { env: { FAL_KEY: 'test-key' }, fetchImpl: async (_url, args) => {
    assert.equal(JSON.parse(args.body).model, 'qwen/qwen3-30b-a3b-instruct-2507');
    return { ok: false, status: 503 };
  } });
});

test('partial, error and invalid planner responses fall back while retaining billed fal usage', async () => {
  const brief = normalizeLogoBrief(request);
  const valid = JSON.stringify({ ...brief, directions: fallbackLogoDirections(brief, 1) });
  for (const payload of [{ output: valid, partial: true }, { output: valid, error: 'upstream failure' }, { output: '{' }, { output: JSON.stringify({ ...brief, brand: 'WRONG', directions: fallbackLogoDirections(brief, 1) }) }]) {
    const result = await planLogoDirections(request, 1, { env: { FAL_KEY: 'test-key' }, fetchImpl: async () => ({ ok: true, json: async () => ({ ...payload, usage: { total_tokens: 50, cost: 0.002, arbitrary: 'ignore' } }) }) });
    assert.equal(result.metadata.mode, 'fallback');
    assert.deepEqual(result.metadata.usage, { total_tokens: 50, cost: 0.002 });
  }
});
