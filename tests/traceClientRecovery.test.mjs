import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { TRACE_REQUEST_TIMEOUT_MS, traceTimeoutMessage, traceConnectionMessage } from '../src/lib/traceRequestPolicy.mjs';

async function retryHarness(fetchImpl) {
  const states = [], requests = [];
  const source = (await readFile(new URL('../src/app/workspace/[id]/hooks/useTraceExecution.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ AbortController, setTimeout, clearTimeout, TRACE_REQUEST_TIMEOUT_MS,
    traceTimeoutMessage, traceConnectionMessage, CREDIT_COST: {}, console,
    trackGenerationStart() {}, trackGenerationFailure() {}, trackGenerationSuccess() {},
    useState: initial => { const i = states.push(initial) - 1; return [initial, value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useCallback: fn => fn, useRef: () => ({ current: null }), useEffect() {},
    fetch: async (...args) => { requests.push(args[0]); return fetchImpl(...args); },
  });
  const useTraceExecution = vm.runInContext(`${source}\nuseTraceExecution`, context);
  const hook = useTraceExecution({ project: { id: 'saved-project', upscaled_image_url: 'upscale' }, setProject() {},
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'session' } } }) } },
  });
  await hook.handleRetryVector();
  return { states, requests };
}

test('free retry displays the server recovery message and makes no charge or refund request', async () => {
  const message = 'The SVG connection was interrupted. Your upscale is saved. Retry Vector SVG for free.';
  const h = await retryHarness(async () => Response.json({ error: 'VECTORIZE_NETWORK_FAILED', message }, { status: 503 }));
  assert.equal(h.states[1].step3, message);
  assert.deepEqual(h.requests, ['/api/trace-step3']);
});

test('a broken browser response gives the same saved-stage recovery advice', async () => {
  const h = await retryHarness(async () => ({ text: async () => { throw new TypeError('terminated'); } }));
  assert.match(h.states[1].step3, /upscale is saved.*Retry Vector SVG for free/);
  assert.equal(h.states[0], 'idle');
});
