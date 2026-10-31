import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { universalUnavailableResponse } from '../src/lib/universalAvailability.mjs';

async function harness(options = {}) {
  const calls = { access: [], rateLimits: [], ownership: [], validation: [], start: [], status: [], save: [], charge: 0, refund: 0 };
  const project = {
    id: 'project-1', user_id: 'owner', trace_type: 'mockup', credits: 0,
    generated_image_url: 'https://storage.test/projects/project-1/flat.png',
    ...options.project,
  };
  const source = (await readFile(new URL('../src/app/api/trace-upscale/route.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  const reply = async (action, args) => {
    calls[action].push(args);
    if (options.jobError) throw options.jobError;
    return options.result || { success: true, status: action === 'save' ? 'succeeded' : 'queued',
      ...(action === 'save' ? { fileUrl: 'https://storage.test/projects/project-1/upscaled.png', alreadySaved: true } : {}),
    };
  };
  const context = vm.createContext({ Response, universalUnavailableResponse, console: { error() {} },
    PROJECT_ACCESS: { EDIT: 'edit', VIEW: 'view' },
    authenticateRequest: async () => ({ user: options.unauthorized ? null : { id: 'authenticated-editor' } }),
    getProjectAccess: async (...args) => { calls.access.push(args); return { project: options.viewOnly || options.denied ? null : project }; },
    enforceRateLimit: async value => {
      calls.rateLimits.push(value);
      return options.rateLimited
        ? { success: false, response: Response.json({ error: 'Slow down' }, { status: 429, headers: { 'retry-after': '3' } }) }
        : { success: true };
    },
    getAllowedStorageHosts: () => ['storage.test'],
    isOwnedStorageUrl: (...args) => { calls.ownership.push(args); return !options.unowned; },
    validateUrlForSSRF: async (...args) => { calls.validation.push(args); return !options.external; },
    startTraceUpscale: (...args) => reply('start', args),
    getTraceUpscaleStatus: (...args) => reply('status', args),
    saveTraceUpscale: (...args) => reply('save', args),
    chargeCreditsVerified: () => { calls.charge++; throw new Error('Upscale must not charge'); },
    refundCreditVerified: () => { calls.refund++; throw new Error('Upscale must not refund'); },
  });
  const post = vm.runInContext(`${source}\nPOST`, context);
  return { calls, project, run: async (body = { projectId: project.id }, requestOptions = {}) => {
    const response = await post(new Request('https://app.test/api/trace-upscale', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer test' },
      body: typeof body === 'string' ? body : JSON.stringify(body), ...requestOptions,
    }));
    return { status: response.status, headers: response.headers, body: await response.json() };
  } };
}
const jobCallCount = calls => calls.start.length + calls.status.length + calls.save.length;

test('unauthorized requests return 401 before parsing a body or accessing project jobs', async () => {
  const h = await harness({ unauthorized: true });
  const result = await h.run('{malformed json');
  assert.equal(result.status, 401);
  assert.equal(result.body.error, 'Unauthorized');
  assert.equal(h.calls.access.length, 0);
  assert.equal(h.calls.rateLimits.length, 0);
  assert.equal(jobCallCount(h.calls), 0);
});

test('view-only or denied project access cannot start, read, or save upscale jobs', async () => {
  for (const action of ['start', 'status', 'save']) {
    const h = await harness({ viewOnly: true });
    assert.equal((await h.run({ projectId: 'project-1', action })).status, 403);
    assert.equal(h.calls.access[0][0], 'authenticated-editor');
    assert.equal(h.calls.access[0][2].required, 'edit');
    assert.equal(jobCallCount(h.calls), 0);
    assert.equal(h.calls.ownership.length, 0);
  }
});

test('missing or refunded flat artwork is rejected before provider job actions', async () => {
  for (const generated_image_url of [null, '', 'REFUNDED']) {
    const h = await harness({ project: { generated_image_url } });
    const result = await h.run({ projectId: 'project-1', action: 'start' });
    assert.equal(result.status, 409);
    assert.equal(result.body.error, 'UPSCALE_SOURCE_REQUIRED');
    assert.equal(jobCallCount(h.calls), 0);
  }
});

test('unowned storage paths and external source hosts cannot reach job operations', async () => {
  for (const options of [{ unowned: true }, { external: true }]) {
    const h = await harness(options);
    const result = await h.run({ projectId: 'project-1', action: 'start' });
    assert.equal(result.status, 400);
    assert.equal(jobCallCount(h.calls), 0);
    assert.equal(h.calls.ownership[0][1].userId, 'owner');
    assert.equal(h.calls.ownership[0][1].projectId, 'project-1');
  }
});

test('status polling has its own 90-per-minute limit and validates the source host', async () => {
  const h = await harness();
  const result = await h.run();
  assert.equal(result.status, 202);
  assert.equal(h.calls.status.length, 1);
  const limit = h.calls.rateLimits[0];
  assert.equal(limit.namespace, 'api:trace-upscale:status');
  assert.equal(limit.max, 90);
  assert.equal(limit.identifier, 'authenticated-editor:project-1');
  assert.deepEqual([...h.calls.validation[0][1].allowedHosts], ['storage.test']);
});

test('missing project IDs and invalid actions are rejected before job access', async () => {
  for (const body of [{}, { action: 'start' }, { projectId: 'project-1', action: 'generate' }]) {
    const h = await harness();
    assert.equal((await h.run(body)).status, 400);
    assert.equal(h.calls.access.length, 0);
    assert.equal(h.calls.rateLimits.length, 0);
    assert.equal(jobCallCount(h.calls), 0);
  }
});

test('start, status, and save dispatch only their intended action with safe response status codes', async () => {
  for (const [action, status, expectedHttp] of [['start', 'queued', 202], ['status', 'running', 202], ['status', 'none', 200], ['save', 'saving', 202], ['save', 'succeeded', 200]]) {
    const h = await harness({ result: { success: true, status } });
    const result = await h.run({ projectId: 'project-1', action, userId: 'impersonated-owner' });
    assert.equal(result.status, expectedHttp);
    assert.equal(result.body.status, status);
    assert.equal(h.calls[action].length, 1);
    assert.equal(jobCallCount(h.calls), 1);
    assert.equal(h.calls[action][0][0].id, 'project-1');
    if (action === 'start') assert.equal(h.calls.start[0][1], 'authenticated-editor');
    assert.equal(h.calls.rateLimits[0].max, action === 'status' ? 90 : 10);
  }
});

test('rate-limited requests return Retry-After without reading or changing jobs', async () => {
  const h = await harness({ rateLimited: true });
  const result = await h.run({ projectId: 'project-1', action: 'start' });
  assert.equal(result.status, 429);
  assert.equal(result.headers.get('retry-after'), '3');
  assert.equal(h.calls.access.length, 0);
  assert.equal(jobCallCount(h.calls), 0);
});

test('known service errors retain safe recovery advice and stale artwork uses a conflict response', async () => {
  for (const [code, status, expectedHttp] of [['UPSCALE_STATUS_UNAVAILABLE', 503, 503], ['ARTWORK_CHANGED', 409, 409]]) {
    const message = 'Your artwork is saved. Resume HD Upscale for free.';
    const h = await harness({ jobError: Object.assign(new Error(message), { code, status }) });
    const result = await h.run();
    assert.equal(result.status, expectedHttp);
    assert.equal(result.body.error, code);
    assert.equal(result.body.message, message);
  }
});

test('unexpected failures do not expose provider credentials or internal stack details', async () => {
  const h = await harness({ jobError: new Error('private-token database-host stack-detail') });
  const result = await h.run();
  assert.equal(result.status, 503);
  assert.equal(result.body.error, 'UPSCALE_UNAVAILABLE');
  assert.match(result.body.message, /saved.*resume for free/);
  assert.doesNotMatch(JSON.stringify(result.body), /private-token|database-host|stack-detail/);
});

test('all actions work for an already-paid zero-credit project without charges or refunds', async () => {
  const h = await harness();
  for (const action of ['start', 'status', 'save']) await h.run({ projectId: 'project-1', action });
  assert.equal(h.project.credits, 0);
  assert.equal(h.calls.charge, 0);
  assert.equal(h.calls.refund, 0);
  assert.equal(jobCallCount(h.calls), 3);
});
