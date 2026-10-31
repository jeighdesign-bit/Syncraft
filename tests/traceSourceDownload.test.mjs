import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { universalUnavailableResponse } from '../src/lib/universalAvailability.mjs';
import { getAllowedStorageHosts, isOwnedStorageUrl, normalizeUserImageUrl, validateUrlForSSRF } from '../src/lib/ssrf.js';

process.env.CLOUDFLARE_PUBLIC_URL = 'https://storage.test';

async function harness(options = {}) {
  const calls = { downloads: 0, charges: 0, refunds: 0, provider: 0 };
  let downloadOptions;
  const source = (await readFile(new URL('../src/app/api/trace/route.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  const project = { id: 'project', user_id: 'owner', original_image_url: options.url || 'https://storage.test/users/owner/crop.jpg' };
  const context = vm.createContext({ Buffer, AbortSignal, URL, universalUnavailableResponse, console: { warn() {}, error() {} },
    NextResponse: Response, PROJECT_ACCESS: { EDIT: 'edit' }, CREDIT_COST: { trace: 12 },
    adminSupabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) } },
    enforceRateLimit: async () => ({ success: true }), getProjectAccess: async () => ({ project }),
    getAllowedStorageHosts, isOwnedStorageUrl, normalizeUserImageUrl, validateUrlForSSRF,
    DEFAULT_MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    fetchStoredAsset: async (_url, settings) => {
      calls.downloads++; downloadOptions = settings;
      if (options.error) throw options.error;
      return { response: { ok: true }, buffer: Buffer.from('image'), finalUrl: project.original_image_url };
    },
    fetchWithSSRFProtection: async () => { throw new Error('Step 1 must use the authenticated storage helper'); },
    chargeCreditsVerified: async () => { calls.charges++; throw Object.assign(new Error('INSUFFICIENT_CREDITS'), { code: 'INSUFFICIENT_CREDITS' }); },
    findLatestProjectCharge: async () => null,
    refundCreditVerified: async () => { calls.refunds++; },
    fetch: async () => { calls.provider++; throw new Error('Must not start provider work'); },
  });
  const post = vm.runInContext(`${source}\nPOST`, context);
  const res = await post(new Request('https://app.test/api/trace', { method: 'POST',
    headers: { authorization: 'Bearer session', 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'project', step: 1 }) }));
  return { status: res.status, body: await res.json(), calls, downloadOptions };
}

test('a valid owned source that times out is a network failure, not an unauthorized URL', async () => {
  const h = await harness({ error: Object.assign(new Error('Remote file download timed out'), { name: 'TimeoutError' }) });
  assert.equal(h.status, 504);
  assert.equal(h.body.code, 'TRACE_SOURCE_TIMEOUT');
  assert.match(h.body.error, /upload is saved.*No credits were deducted/);
  assert.doesNotMatch(h.body.error, /unauthorized|invalid.*URL/i);
  assert.equal(h.calls.charges, 0); assert.equal(h.calls.refunds, 0); assert.equal(h.calls.provider, 0);
});

test('transient connection failures preserve the upload and do not charge', async () => {
  for (const message of ['terminated', 'fetch failed']) {
    const h = await harness({ error: new TypeError(message) });
    assert.equal(h.status, 503); assert.equal(h.body.code, 'TRACE_SOURCE_UNAVAILABLE');
    assert.equal(h.calls.charges, 0); assert.equal(h.calls.refunds, 0);
  }
});

test('invalid and other-user URLs are still blocked before storage or billing', async () => {
  for (const url of ['https://evil.test/users/owner/crop.jpg', 'https://storage.test/users/another-user/crop.jpg', 'https://user:password@storage.test/users/owner/crop.jpg']) {
    const h = await harness({ url });
    assert.equal(h.status, 400); assert.equal(h.calls.downloads, 0); assert.equal(h.calls.charges, 0);
  }
});

test('size and content-type failures retain their own validation errors', async () => {
  for (const [message, status] of [['Remote file is too large', 413], ['Remote file has an invalid content type', 415]]) {
    const h = await harness({ error: new Error(message) });
    assert.equal(h.status, status); assert.equal(h.calls.charges, 0);
  }
});

test('valid sources use bounded resilient storage reads before billing', async () => {
  const h = await harness();
  assert.equal(h.calls.downloads, 1); assert.equal(h.calls.charges, 1);
  assert.equal(h.downloadOptions.timeoutMs, 25000); assert.equal(h.downloadOptions.maxAttempts, 2); assert.ok(h.downloadOptions.signal);
  assert.equal(h.body.error, 'INSUFFICIENT_CREDITS');
});
