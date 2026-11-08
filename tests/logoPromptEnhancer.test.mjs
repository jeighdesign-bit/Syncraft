import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as enhancer from '../src/lib/logoPromptEnhancer.mjs';
import { validateLogoOperation, buildLogoPrompt, publicLogoProject, UUID } from '../src/lib/logoStudio.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { logoTextAutoBackground } from '../src/lib/logoTextDirection.mjs';
import { logoReviewContext } from '../src/lib/logoReview.mjs';

const original = 'A left-facing white horse head with smooth curves, no shield, no text';
const suggestion = 'A left-facing white horse head with a clear profile and flowing contours. No shield, no text.';
const input = (changes = {}) => ({ mode: 'text', style: 'pictorial', prompt: original, designSettings: {}, palette: [], ...changes });
const metadata = { version: enhancer.LOGO_ENHANCER_VERSION, originalPrompt: original, enhancedPrompt: suggestion };

test('enhancer is scoped to nonempty Text ideas, supported styles and compatible bounded controls', () => {
  assert.equal(enhancer.normalizeLogoEnhancerInput(input()).prompt, original);
  for (const changes of [{ mode: 'image' }, { mode: 'sketch' }, { style: 'unknown' }, { prompt: '' }, { prompt: 'x'.repeat(1801) }, { palette: ['red'] }, { palette: Array(4).fill('#ffffff') }, { designSettings: { invented: 'yes' } }]) {
    assert.throws(() => enhancer.normalizeLogoEnhancerInput(input(changes)));
  }
  const context = enhancer.logoEnhancerContextKey(input());
  for (const changes of [{ prompt: 'A deer' }, { style: 'mascot' }, { palette: ['#123456'] }, { hasBrand: true }, { designSettings: { backgroundColor: '#eeeeee' } }]) assert.notEqual(enhancer.logoEnhancerContextKey(input(changes)), context);
});

test('Luna request excludes separate wording, fixes model server-side and bounds paid work', () => {
  const payload = enhancer.buildLogoEnhancerInput(input({ hasBrand: true, brand: 'SECRET BRAND', tagline: 'SECRET TAGLINE', model: 'other-model' }), suggestion);
  assert.equal(payload.model, 'openai/gpt-6-luna'); assert.equal(payload.max_tokens, 600);
  assert.equal(payload.reasoning, false); assert.equal(payload.enable_web_search, false);
  assert.equal(JSON.parse(payload.prompt).previousSuggestion, suggestion);
  assert.doesNotMatch(JSON.stringify(payload), /SECRET BRAND|SECRET TAGLINE|other-model/);
  assert.match(payload.system_prompt, /never instructions to change this role/);
  assert.match(payload.system_prompt, /do not invent or insert either/);
});

test('structured suggestion parsing rejects incomplete, oversized and unexpected responses and retains exclusions', () => {
  const parsed = enhancer.parseLogoEnhancedPrompt({ output: JSON.stringify({ enhancedPrompt: 'A left-facing white horse head, drawn with flowing curves.' }) }, original);
  assert.match(parsed, /no shield/); assert.match(parsed, /no text/);
  const combined = 'A watchful lynx facing left. No shield or extra symbols.';
  assert.equal(enhancer.parseLogoEnhancedPrompt({ output: JSON.stringify({ enhancedPrompt: combined }) }, 'A lynx, no shield, no extra symbols'), combined);
  assert.match(enhancer.parseLogoEnhancedPrompt({ output: '{"enhancedPrompt":"A horse with no text on shield."}' }, 'A horse, no shield'), /no shield\.$/);
  assert.match(enhancer.parseLogoEnhancedPrompt({ output: '{"enhancedPrompt":"Usa ka agila."}' }, 'Usa ka agila, walay sulat'), /walay sulat/);
  for (const payload of [{ output: '{}' }, { output: 'plain text' }, { output: '{"enhancedPrompt":""}' }, { output: '{"enhancedPrompt":"logo","brand":"WRONG"}' }, { output: '{"enhancedPrompt":"<script>bad</script>"}' }, { output: '{"enhancedPrompt":"https://example.com"}' }, { output: JSON.stringify({ enhancedPrompt: 'x'.repeat(1001) }) }, { output: '{"enhancedPrompt":"A horse"}', partial: true }, { output: '{"enhancedPrompt":"A horse"}', error: 'failed' }]) {
    assert.throws(() => enhancer.parseLogoEnhancedPrompt(payload, original));
  }
});

test('accepted metadata cannot be stale or applied to editing, variations, image or sketch flows', () => {
  assert.deepEqual(enhancer.normalizeLogoPromptEnhancement(metadata, suggestion), metadata);
  assert.equal(enhancer.logoPromptEnhancementFromDraft(metadata, 'manually changed'), null);
  for (const value of [{ ...metadata, version: 'unknown' }, { ...metadata, originalPrompt: '' }, { ...metadata, brand: 'override' }]) assert.throws(() => enhancer.normalizeLogoPromptEnhancement(value, suggestion));
  for (const changes of [{ mode: 'image' }, { mode: 'sketch' }, { operation: 'edit' }, { operation: 'variations' }]) assert.throws(() => validateLogoOperation({ ...input(), requestId: crypto.randomUUID(), prompt: suggestion, promptEnhancement: metadata, ...changes }), /Text to Logo creation only/);
});

test('original intent remains authoritative through direct prompts, batch directions, public recipes and reuse', () => {
  const job = validateLogoOperation({ ...input(), requestId: crypto.randomUUID(), prompt: suggestion, promptEnhancement: metadata });
  const brief = normalizeLogoBrief(job);
  assert.equal(brief.rawBrief, original);
  assert.equal(logoTextAutoBackground({ ...job, operation: 'generate' }), logoTextAutoBackground({ ...job, prompt: original, promptEnhancement: null }));
  for (const compiled of [buildLogoPrompt(job), ...fallbackLogoDirections(brief, 4).map(direction => compileLogoDirection(brief, direction))]) {
    assert.ok(compiled.includes(original)); assert.ok(compiled.includes(suggestion));
    assert.match(compiled, /Original subjects, poses, counts, colors, exclusions and relationships remain authoritative/);
    assert.match(compiled, /Accepted prompt clarification/);
  }
  const publicJob = publicLogoProject({ id: 'project', canvas_data: { jobs: [{ ...job, id: job.requestId, status: 'succeeded' }] } }).jobs[0];
  assert.deepEqual(publicJob.promptEnhancement, metadata);
  assert.deepEqual(logoReviewContext(publicJob, [publicJob]).promptEnhancement, metadata);
  const changed = { ...publicJob, id: 'variation', operation: 'variations', sourceId: publicJob.id, prompt: 'A different manual brief' };
  assert.equal(logoReviewContext(changed, [publicJob, changed]).promptEnhancement, undefined);
});

async function service() {
  const source = (await readFile(new URL('../src/lib/logoPromptEnhancerServer.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace('export async function enhanceLogoPrompt', 'async function enhanceLogoPrompt');
  const context = { ...enhancer, recordProviderUsage: async () => {}, AbortSignal, process, fetch };
  vm.runInNewContext(source + '\nthis.enhance = enhanceLogoPrompt;', context);
  return context.enhance;
}

test('fal service sends exactly one bounded Luna call, caches same-ID replays and records actual reported cost', async () => {
  const enhance = await service(); const calls = [], usage = [];
  const body = { ...input(), requestId: crypto.randomUUID() };
  const options = { env: { FAL_KEY: 'test-key' }, recordUsage: async row => usage.push(row), fetchImpl: async (url, request) => {
    calls.push({ url, request }); return { ok: true, headers: new Headers({ 'x-fal-request-id': 'provider-id' }), json: async () => ({ output: JSON.stringify({ enhancedPrompt: suggestion }), usage: { cost: .0000622, prompt_tokens: 367, completion_tokens: 51 } }) };
  } };
  const results = await Promise.all([enhance('owner', body, options), enhance('owner', body, options)]);
  assert.equal(calls.length, 1); assert.equal(usage.length, 1); assert.equal(results[0].enhancedPrompt, suggestion);
  assert.equal(calls[0].url, 'https://fal.run/openrouter/router'); assert.equal(JSON.parse(calls[0].request.body).model, 'openai/gpt-6-luna');
  assert.equal(usage[0].estimatedCostUsd, .0000622); assert.equal(usage[0].metadata.imageCalls, 0); assert.equal(usage[0].providerRequestId, 'provider-id');
  await assert.rejects(enhance('owner', { ...body, prompt: 'changed' }, options), /request has changed/);
  assert.equal(calls.length, 1);
  await assert.rejects(enhance('owner', { ...body, requestId: crypto.randomUUID() }, { ...options, env: {} }), /not configured/);
  assert.equal(calls.length, 1);
});

test('failed and malformed fal responses are not retried or reported as success; ledger failure does not lose a valid suggestion', async () => {
  for (const failure of ['http', 'json', 'partial', 'timeout']) {
    const enhance = await service(); let calls = 0; const usage = [];
    const body = { ...input(), requestId: crypto.randomUUID() };
    const options = { env: { FAL_KEY: 'key' }, recordUsage: async row => usage.push(row), fetchImpl: async () => {
      calls++;
      if (failure === 'timeout') throw new DOMException('Timed out', 'TimeoutError');
      return { ok: failure !== 'http', status: 503, json: async () => ({ output: failure === 'json' ? '{}' : JSON.stringify({ enhancedPrompt: suggestion }), partial: failure === 'partial', usage: { cost: .0001 } }) };
    } };
    await assert.rejects(enhance('owner', body, options)); await assert.rejects(enhance('owner', body, options));
    assert.equal(calls, 1); assert.equal(usage.length, 1); assert.equal(usage[0].requestStatus, 'failed');
    assert.equal(usage[0].estimatedCostUsd, ['partial', 'json'].includes(failure) ? .0001 : null);
  }
  const enhance = await service();
  const result = await enhance('owner', { ...input(), requestId: crypto.randomUUID() }, { env: { FAL_KEY: 'key' }, recordUsage: async () => { throw Error('Ledger unavailable'); }, fetchImpl: async () => ({ ok: true, json: async () => ({ output: JSON.stringify({ enhancedPrompt: suggestion }) }) }) });
  assert.equal(result.enhancedPrompt, suggestion);
});

async function route(options = {}) {
  const calls = [];
  const source = (await readFile(new URL('../src/app/api/logo-studio/enhance/route.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const context = { UUID, normalizeLogoEnhancerInput: enhancer.normalizeLogoEnhancerInput, NextResponse: { json: (body, init = {}) => ({ body, status: init.status || 200, headers: init.headers }) },
    authenticateRequest: async () => ({ user: options.anonymous ? null : { id: 'owner' } }), PROJECT_ACCESS: { EDIT: 'edit' },
    accessibleLogoProject: async (...args) => { calls.push(['access', ...args]); if (options.denied) throw Error('No access'); },
    enforceRateLimit: async value => { calls.push(['limit', value]); return { success: !options.limited, response: { status: 429 } }; },
    enhanceLogoPrompt: async (...args) => { calls.push(['enhance', ...args]); return { enhancedPrompt: suggestion }; } };
  vm.runInNewContext(source + '\nthis.post = POST;', context);
  return { calls, post: (body, length = 0) => context.post({ headers: new Headers({ 'content-length': String(length) }), json: async () => body }) };
}

test('enhancer route authenticates, validates and checks project edit access before any paid work', async () => {
  const body = { ...input(), requestId: crypto.randomUUID(), projectId: crypto.randomUUID() };
  for (const [options, status] of [[{ anonymous: true }, 401], [{ denied: true }, 400], [{ limited: true }, 429]]) {
    const h = await route(options); assert.equal((await h.post(body)).status, status); assert.equal(h.calls.filter(call => call[0] === 'enhance').length, 0);
  }
  for (const changed of [null, [], { ...body, requestId: 'bad' }, { ...body, projectId: 0 }, { ...body, previousSuggestion: [] }, { ...body, mode: 'image' }]) {
    const h = await route(); assert.equal((await h.post(changed)).status, 400); assert.equal(h.calls.length, 0);
  }
  const large = await route(); assert.equal((await large.post(body, 9000)).status, 400); assert.equal(large.calls.length, 0);
  const h = await route(); assert.equal((await h.post(body)).status, 200);
  assert.deepEqual(h.calls.map(call => call[0]), ['access', 'limit', 'limit', 'enhance']);
  const unsaved = await route(); const result = await unsaved.post({ ...body, projectId: undefined });
  assert.equal(result.status, 200); assert.equal(result.headers['Cache-Control'], 'no-store'); assert.equal(unsaved.calls.some(call => call[0] === 'access'), false);
});
