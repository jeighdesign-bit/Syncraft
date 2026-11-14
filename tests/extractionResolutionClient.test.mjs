import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as policy from '../src/lib/extractionResolution.mjs';
import { TRACE_REQUEST_TIMEOUT_MS, traceTimeoutMessage, traceConnectionMessage } from '../src/lib/traceRequestPolicy.mjs';

const source = (await readFile(new URL('../src/app/workspace/[id]/hooks/useTraceExecution.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');

function harness({ resolution = '1K', credits = 100, traceType = 'mockup', failure, captureLogs = false } = {}) {
  const requests = [], states = [];
  const element = () => ({ children: [], textContent: '', appendChild(child) { this.children.push(child); }, set innerHTML(_) { this.children = []; } });
  const log = element();
  const logText = node => [node.textContent, ...node.children.map(logText)].join(' ');
  let balance = credits, noCredits = 0, project = { id: 'project', trace_type: traceType };
  const cost = policy.extractionCredits(resolution, traceType);
  const context = vm.createContext({ ...policy, normalizeExtractionResolution: policy.extractionResolution,
    AbortController, AbortSignal, Response, setTimeout, clearTimeout, TRACE_REQUEST_TIMEOUT_MS, traceTimeoutMessage, traceConnectionMessage,
    CREDIT_COST: { trace: 12, universal: 24 }, console: { error() {} }, document: { createElement: element },
    trackGenerationStart() {}, trackGenerationFailure() {}, trackGenerationSuccess() {},
    useState: initial => { const index = states.push(initial) - 1; return [initial, value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useRef: initial => ({ current: initial }), useEffect() {}, useCallback: callback => callback,
    waitForTraceUpscale: async () => null,
    fetch: async (url, init) => {
      const body = JSON.parse(init.body); requests.push({ url, body });
      if (failure) return Response.json(failure.body, { status: failure.status });
      return Response.json({ success: true, alreadySaved: true, fileUrl: 'https://storage.test/flat.png', resolution, creditsCharged: cost, balanceAfter: credits - cost });
    },
  });
  const hook = vm.runInContext(`${source}\nuseTraceExecution`, context)({ project, extractionResolution: resolution,
    userCredits: credits, setUserCredits: update => { balance = typeof update === 'function' ? update(balance) : update; },
    setProject: update => { project = update(project); }, onNoCredits: () => { noCredits++; },
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'session' } } }) } },
  });
  if (captureLogs) hook.consoleRef.current = log;
  return { hook, requests, balance: () => balance, noCredits: () => noCredits, text: () => logText(log) };
}

test('garment and logo send the selected resolution and use the approved 12/16/24 credits', async () => {
  for (const traceType of ['mockup', 'logo']) for (const [resolution, expectedCost] of [['1K', 12], ['2K', 16], ['4K', 24]]) {
    const h = harness({ resolution, traceType });
    await h.hook.handleExecuteTrace();
    assert.equal(h.requests.length, 1); assert.equal(h.requests[0].url, '/api/trace');
    assert.equal(h.requests[0].body.resolution, resolution);
    assert.equal(h.requests[0].body.credits, undefined);
    assert.equal(h.balance(), 100 - expectedCost);
  }
});

test('insufficient local balance prevents 4K generation and a stale balance uses the server amount', async () => {
  const local = harness({ resolution: '4K', credits: 23 });
  await local.hook.handleExecuteTrace();
  assert.equal(local.requests.length, 0); assert.equal(local.balance(), 23); assert.equal(local.noCredits(), 1);
  const stale = harness({ resolution: '4K', failure: { status: 403, body: { error: 'INSUFFICIENT_CREDITS', balance: 23 } } });
  await stale.hook.handleExecuteTrace();
  assert.equal(stale.balance(), 23); assert.equal(stale.noCredits(), 1);
});

test('exactly 24 credits allows garment and logo 4K generation', async () => {
  for (const traceType of ['mockup', 'logo']) {
    const h = harness({ resolution: '4K', credits: 24, traceType });
    await h.hook.handleExecuteTrace();
    assert.equal(h.requests.length, 1); assert.equal(h.balance(), 0); assert.equal(h.noCredits(), 0);
  }
});

test('a confirmed historical 4K refund preserves its original 20-credit amount without another refund request', async () => {
  const h = harness({ resolution: '4K', captureLogs: true, failure: { status: 500, body: { error: 'Invalid output', refunded: true, refundedCredits: 20, balance: 100 } } });
  await h.hook.handleExecuteTrace();
  assert.equal(h.balance(), 100); assert.equal(h.requests.length, 1);
  assert.match(h.text(), /20 Credits have been refunded/);
});

test('the activity log preserves the specific generated-image download timeout instead of a generic request timeout', async () => {
  const message = 'Your artwork was generated, but the image download timed out. Your credits have been refunded automatically.';
  const h = harness({ resolution: '4K', captureLogs: true, failure: { status: 503, body: { error: message, code: 'EXTRACTION_DOWNLOAD_TIMEOUT', refunded: true, balance: 100 } } });
  await h.hook.handleExecuteTrace();
  assert.ok(h.text().includes(message));
  assert.doesNotMatch(h.text(), /The request took too long/);
  assert.equal(h.requests.length, 1);
  assert.equal(h.balance(), 100);
});

test('double-clicking Generate cannot start two paid requests', async () => {
  const h = harness({ resolution: '4K' });
  await Promise.all([h.hook.handleExecuteTrace(), h.hook.handleExecuteTrace()]);
  assert.equal(h.requests.length, 1); assert.equal(h.balance(), 76);
});

test('requests rejected before billing do not reduce the displayed balance', async () => {
  for (const resolution of ['1K', '2K', '4K']) {
    for (const failure of [
      { status: 429, body: { error: 'Too many requests' } },
      { status: 503, body: { error: 'Source unavailable', code: 'TRACE_SOURCE_UNAVAILABLE' } },
    ]) {
      const h = harness({ resolution, failure });
      await h.hook.handleExecuteTrace();
      assert.equal(h.balance(), 100);
    }
  }
});

test('failed extraction uses the server balance even when a refund is unavailable', async () => {
  const h = harness({ resolution: '4K', failure: {
    status: 500, body: { error: 'Generation failed', refunded: false, balance: 73 },
  } });
  await h.hook.handleExecuteTrace();
  assert.equal(h.balance(), 73);
});

test('a refund without a balance cannot add credits that were never deducted locally', async () => {
  const h = harness({ resolution: '4K', failure: {
    status: 500, body: { error: 'Generation failed', refunded: true, refundedCredits: 20 },
  } });
  await h.hook.handleExecuteTrace();
  assert.equal(h.balance(), 100);
});

test('Universal sends the selected native resolution and uses the approved 12/16/24 credits', async () => {
  for (const resolution of ['1K', '2K', '4K']) {
    const h = harness({ resolution, traceType: 'universal' });
    await h.hook.handleExecuteTrace();
    assert.equal(h.requests[0].url, '/api/recovery/generate');
    assert.deepEqual(h.requests[0].body, { projectId: 'project', resolution });
    assert.equal(h.balance(), 100 - policy.extractionCredits(resolution, 'universal'));
  }
});

test('a historical Universal V3 refund preserves the original 28-credit charge without a second refund request',async()=>{
  const h=harness({traceType:'universal',resolution:'4K',captureLogs:true,
    failure:{status:500,body:{error:'The provider did not return native 4K artwork.',code:'EXTRACTION_RESOLUTION_MISMATCH',refunded:true,refundedCredits:28,balance:100}}});
  await h.hook.handleExecuteTrace();
  assert.equal(h.balance(),100);
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].url,'/api/recovery/generate');
  assert.match(h.text(),/28 Credits have been refunded/);
});
