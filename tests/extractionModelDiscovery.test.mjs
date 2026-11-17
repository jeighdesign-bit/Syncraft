import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { supportsExtractionResolution } from '../src/lib/extractionResolution.mjs';

const source = (await readFile(new URL('../src/app/workspace/[id]/hooks/useExtractionModels.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\r?\n/gm, '').replace('export function ', 'function ');
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness(env = 'development') {
  const states = [];
  let cursor = 0, effect, cleanup;
  const requests = [], defaults = [];
  const context = vm.createContext({ process: { env: { NODE_ENV: env } }, supportsExtractionResolution, AbortController, AbortSignal,
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    }, useEffect: value => { effect = value; },
    fetch: (_url, options) => new Promise((resolve, reject) => requests.push({ resolve, reject, signal: options.signal })),
  });
  const hook = vm.runInContext(`${source}\nuseExtractionModels`, context);
  const onDefault = value => defaults.push(value);
  return { requests, defaults, render: project => { cursor = 0; return hook(project, onDefault); }, effect: () => { cleanup?.(); cleanup = effect(); } };
}

test('all extraction tools wait for discovery before selecting configured Vela, without reapplying the default on rerender', async () => {
  for (const trace_type of ['mockup', 'logo', 'universal']) {
    const h = harness(), project = { id: trace_type, trace_type };
    assert.equal(h.render(project).loading, true);
    h.effect();
    h.requests[0].resolve({ ok: true, json: async () => ({ enabled: true, configured: true }) });
    await settle();
    assert.equal(h.render(project).loading, false);
    assert.equal(h.render(project).option.configured, true);
    assert.deepEqual(h.defaults, ['openai']);
  }
});

test('a late capability response cannot select Vela in a different project', async () => {
  const h = harness();
  h.render({ id: 'first', trace_type: 'mockup' }); h.effect();
  const current = { id: 'second', trace_type: 'logo' };
  assert.equal(h.render(current).loading, true); h.effect();
  assert.equal(h.requests[0].signal.aborted, true);
  h.requests[0].resolve({ ok: true, json: async () => ({ enabled: true, configured: true }) });
  await settle();
  assert.deepEqual(h.defaults, []);
  assert.equal(h.render(current).loading, true);
  h.requests[1].resolve({ ok: false, status: 404 }); await settle();
  assert.equal(h.render(current).loading, false);
  assert.equal(h.render(current).option, null);
});

test('a transient failed lookup retries and restores Vela instead of falling back to Lyra', async () => {
  const h = harness(), project = { id: 'retry', trace_type: 'mockup' };
  h.render(project); h.effect();
  h.requests[0].reject(new Error('timeout')); await settle();
  assert.equal(h.requests.length, 2);
  assert.equal(h.render(project).loading, true);
  h.requests[1].resolve({ ok: true, json: async () => ({ enabled: true, configured: true }) }); await settle();
  assert.deepEqual(h.defaults, ['openai']);
  assert.equal(h.render(project).error, false);
});

test('repeated discovery failures expose a recoverable error without selecting a provider', async () => {
  const h = harness(), project = { id: 'failed', trace_type: 'logo' };
  h.render(project); h.effect();
  h.requests[0].resolve({ ok: false, status: 503 }); await settle();
  h.requests[1].reject(new Error('offline')); await settle();
  assert.equal(h.render(project).loading, false);
  assert.equal(h.render(project).error, true);
  assert.deepEqual(h.defaults, []);
  h.render(project).retry();
  assert.equal(h.render(project).loading, true); h.effect();
  h.requests[2].resolve({ ok: true, json: async () => ({ enabled: true, configured: true }) }); await settle();
  assert.equal(h.render(project).error, false);
  assert.deepEqual(h.defaults, ['openai']);
});

test('production uses server capabilities, while disabled environments and missing keys retain Lyra', async () => {
  const project = { id: 'project', trace_type: 'mockup' }, production = harness('production');
  assert.equal(production.render(project).loading, true); production.effect();
  production.requests[0].resolve({ ok: true, json: async () => ({ enabled: true, configured: true }) }); await settle();
  assert.deepEqual(production.defaults, ['openai']);
  const preview = harness('production'); preview.render(project); preview.effect();
  preview.requests[0].resolve({ ok: true, json: async () => ({ enabled: false, configured: false }) }); await settle();
  assert.equal(preview.render(project).option.enabled, false); assert.deepEqual(preview.defaults, []);
  const local = harness(); local.render(project); local.effect();
  local.requests[0].resolve({ ok: true, json: async () => ({ enabled: true, configured: false }) }); await settle();
  assert.equal(local.render(project).loading, false); assert.deepEqual(local.defaults, []);
});
