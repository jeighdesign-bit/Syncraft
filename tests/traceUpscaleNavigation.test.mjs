import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { TRACE_REQUEST_TIMEOUT_MS, traceTimeoutMessage, traceConnectionMessage } from '../src/lib/traceRequestPolicy.mjs';

async function harness(options = {}) {
  const effects = [], states = [], requests = [];
  let currentProject = {
    id: 'saved-project', trace_type: 'mockup', generated_image_url: 'https://storage.test/flat.png',
    upscaled_image_url: null, svg_url: null,
  };
  let signal, resolveSvg, rejectSvg, enterSvg;
  const svgEntered = new Promise(resolve => { enterSvg = resolve; });
  const source = (await readFile(new URL('../src/app/workspace/[id]/hooks/useTraceExecution.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({
    AbortController, AbortSignal, DOMException, setTimeout, clearTimeout, queueMicrotask,
    TRACE_REQUEST_TIMEOUT_MS, traceTimeoutMessage, traceConnectionMessage,
    CREDIT_COST: { trace: 12, universal: 20 }, console: { error() {} },
    trackGenerationStart() {}, trackGenerationFailure() {}, trackGenerationSuccess() {},
    useState: initial => {
      const i = states.push(initial) - 1;
      return [initial, value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }];
    },
    useCallback: fn => fn,
    useRef: () => ({ current: null }),
    useEffect: (effect, dependencies) => { effects.push({ effect, dependencies }); },
    waitForTraceUpscale: async () => {
      if (options.abortAtUpscaleBoundary) queueMicrotask(() => cleanup());
      return { status: 'succeeded', fileUrl: 'https://storage.test/upscale.png', alreadySaved: true };
    },
    fetch: async (url, init) => {
      requests.push({ url, body: JSON.parse(init.body) });
      if (url === '/api/trace-upscale') return Response.json({ success: true, status: 'none' });
      if (url === '/api/trace') return Response.json({ success: true, base64: 'image', mimeType: 'image/png' });
      if (url === '/api/save-asset') return Response.json({ success: true, url: 'https://storage.test/new-flat.png' });
      if (url === '/api/refund') return Response.json({ success: true });
      if (url !== '/api/trace-step3') throw new Error(`Unexpected request: ${url}`);
      signal = init.signal;
      enterSvg();
      return new Promise((resolve, reject) => {
        resolveSvg = () => resolve(Response.json({ success: true, svg_url: 'https://storage.test/old-vector.svg' }));
        rejectSvg = reject;
        if (!options.ignoreAbort) signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    },
  });
  const useTraceExecution = vm.runInContext(`${source}\nuseTraceExecution`, context);
  const hook = useTraceExecution({
    project: { ...currentProject }, userCredits: 100, setUserCredits() {}, canEditProject: options.canEditProject === true,
    setProject: update => { currentProject = typeof update === 'function' ? update(currentProject) : update; },
    supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'session' } } }) } },
  });
  const cleanup = effects[0].effect();
  return {
    hook, requests, states, cleanup, svgEntered,
    runAutoResumeEffect: () => effects[1].effect(),
    svgSignal: () => signal,
    finishSvg: () => resolveSvg(),
    failSvg: error => rejectSvg(error),
    project: () => currentProject,
    navigate: () => { currentProject = { id: 'new-project', generated_image_url: 'new-flat', upscaled_image_url: null, svg_url: null }; },
  };
}

test('navigation during SVG processing cancels the saved-stage continuation without generating or refunding', async () => {
  const h = await harness();
  const pending = h.hook.handleResumeFromStep2();
  await h.svgEntered;
  h.navigate();
  h.cleanup();
  assert.equal((await pending).success, false);
  assert.equal(h.svgSignal().aborted, true);
  assert.deepEqual(h.requests.map(request => request.url), ['/api/trace-step3']);
  assert.equal(h.project().id, 'new-project');
  assert.equal(h.project().svg_url, null);
  assert.equal(h.project().upscaled_image_url, null);
});

test('a late SVG response cannot stamp an older project result into the current project', async () => {
  const h = await harness({ ignoreAbort: true });
  const pending = h.hook.handleResumeFromStep2();
  await h.svgEntered;
  h.navigate();
  h.finishSvg();
  await pending;
  assert.equal(h.project().id, 'new-project');
  assert.equal(h.project().svg_url, null);
  assert.equal(h.project().upscaled_image_url, null);
  assert.deepEqual(h.requests.map(request => request.url), ['/api/trace-step3']);
});

test('navigation at the resolved-upscale boundary cannot trigger a generation refund', async () => {
  const h = await harness({ abortAtUpscaleBoundary: true });
  assert.equal((await h.hook.handleExecuteTrace()).success, false);
  assert.deepEqual(h.requests.map(request => request.url), ['/api/trace', '/api/save-asset']);
  assert.equal(h.project().svg_url, null);
});

test('opening a project with no existing upscale job checks status without starting paid work', async () => {
  const h = await harness({ canEditProject: true });
  h.runAutoResumeEffect();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.requests, [{ url: '/api/trace-upscale', body: { projectId: 'saved-project', action: 'status' } }]);
  assert.equal(h.project().upscaled_image_url, null);
});

test('read-only collaborators do not start the auto-resume effect or request provider status', async () => {
  const h = await harness({ canEditProject: false });
  h.runAutoResumeEffect();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.requests, []);
});
