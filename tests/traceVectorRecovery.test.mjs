import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { universalUnavailableResponse } from '../src/lib/universalAvailability.mjs';
import sharp from 'sharp';
import { isTransientFetchError } from '../src/lib/ssrf.js';

async function harness(options = {}) {
  const raster = await sharp({ create: { width: 256, height: 256, channels: 3, background: '#f7eec9' } }).png().toBuffer();
  const project = { id: 'project', user_id: 'owner', trace_type: 'mockup', upscaled_image_url: 'https://storage.test/projects/project/upscale.png', generated_image_url: 'flat' };
  const receipts = [], failures = [], calls = { provider: 0, source: 0, svg: 0, upload: 0 };
  let failDownload = options.failDownload;
  const db = { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from(table) {
    const filters = {}, query = {
      select() { return this; }, eq(key, value) { filters[key] = value; return this; },
      contains(_key, value) { filters.metadata = value; return this; }, gte() { return this; },
      order() { return this; }, limit() { return this; }, abortSignal() { return this; }, update(value) { this.value = value; return this; },
      async maybeSingle() {
        if (table === 'provider_usage_logs') {
          const match = receipts.filter(r => Object.entries(filters.metadata).every(([key, value]) => r.metadata[key] === value)).at(-1);
          return { data: match || null };
        }
        if (options.saveError) return { error: { message: 'database unavailable' } };
        if (options.changedSource || filters.upscaled_image_url !== project.upscaled_image_url) return { data: null };
        Object.assign(project, this.value); return { data: { id: project.id } };
      },
    }; return query;
  } };
  const source = (await readFile(new URL('../src/app/api/trace-step3/route.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '').replace("const sharp = (await import('sharp')).default;", '');
  const context = vm.createContext({ Buffer, Blob, FormData, AbortSignal, DOMException, Date, setTimeout, sharp, universalUnavailableResponse,
    console: { info() {}, warn() {}, error() {} }, process: { env: { RECRAFT_API_KEY: 'test' } },
    NextResponse: Response, adminSupabase: db, PROJECT_ACCESS: { EDIT: 'edit' },
    enforceRateLimit: async () => ({ success: true }),
    getProjectAccess: async () => ({ project: options.denied ? null : structuredClone(project) }),
    isOwnedStorageUrl: () => true, validateUrlForSSRF: async () => true,
    getAllowedStorageHosts: () => ['storage.test'], getAllowedProviderHosts: () => ['provider.test'],
    DEFAULT_MAX_UPSCALED_IMAGE_BYTES: 96 * 1024 * 1024, DEFAULT_MAX_SVG_BYTES: 8 * 1024 * 1024, isTransientFetchError,
    findLatestProjectCharge: async () => ({ transactionId: 'charge', isOwnerTest: false }),
    recordProviderUsage: async row => { (row.requestStatus === 'failed' ? failures : receipts).push(row); },
    fetchStoredAsset: async () => { calls.source++; return { response: { ok: true }, buffer: raster }; },
    fetchWithSSRFProtection: async () => {
      calls.svg++;
      if (failDownload) { failDownload = false; throw new TypeError('terminated', { cause: { code: 'UND_ERR_SOCKET' } }); }
      return { response: { ok: true }, buffer: Buffer.from(options.invalidSvg ? '<svg>truncated' : '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0h2v2z" /></svg>') };
    },
    uploadToR2: async () => { calls.upload++; return 'https://storage.test/projects/project/vector.svg'; },
    fetch: async () => {
      calls.provider++;
      if (options.temporaryRejection && calls.provider === 1) return new Response('busy', { status: 503 });
      if (options.providerError) throw new TypeError('fetch failed');
      if (options.providerStatus) return new Response('bad', { status: options.providerStatus });
      return Response.json({ image: { url: 'https://provider.test/result.svg' }, id: `provider-${calls.provider}` });
    },
  });
  const post = vm.runInContext(`${source}\nPOST`, context);
  return { project, calls, receipts, failures, run: async (body = {}) => {
    const response = await post(new Request('https://app.test/api/trace-step3', { method: 'POST', headers: { authorization: 'Bearer session', 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'project', ...body }) }));
    return { status: response.status, body: await response.json() };
  } };
}

test('a saved provider result recovers an interrupted SVG download without vectorizing again', async () => {
  const h = await harness({ failDownload: true });
  const first = await h.run();
  assert.equal(first.status, 503);
  assert.equal(first.body.error, 'VECTORIZE_NETWORK_FAILED');
  assert.match(first.body.message, /saved.*free/);
  assert.equal(h.project.generated_image_url, 'flat');
  assert.equal(h.failures[0].metadata.stage, 'download-svg');
  assert.equal(h.failures[0].metadata.cause_code, 'UND_ERR_SOCKET');
  const retry = await h.run({ skipRefund: true });
  assert.equal(retry.status, 200);
  assert.equal(h.calls.provider, 1);
  assert.equal(h.calls.source, 1);
  assert.equal(h.calls.upload, 1);
  assert.match(h.project.svg_url, /vector.svg$/);
});

test('a changed palette or source cannot reuse the wrong provider SVG', async () => {
  const h = await harness();
  await h.run();
  await h.run({ colors: '4' });
  assert.equal(h.calls.provider, 2);
  h.project.upscaled_image_url = 'https://storage.test/projects/project/extended.png';
  await h.run({ colors: '4' });
  assert.equal(h.calls.provider, 3);
});

test('a database failure is never presented as a successful saved SVG', async () => {
  const h = await harness({ saveError: true });
  const result = await h.run();
  assert.equal(result.status, 500);
  assert.equal(result.body.error, 'VECTORIZE_FAILED');
  assert.equal(h.failures[0].metadata.stage, 'save-project');
  assert.equal(h.project.svg_url, undefined);
});

test('artwork changed during vectorization is not overwritten by a stale result', async () => {
  const h = await harness({ changedSource: true });
  const result = await h.run();
  assert.equal(result.status, 409);
  assert.equal(result.body.error, 'ARTWORK_CHANGED');
  assert.equal(h.project.svg_url, undefined);
});

test('an ambiguous provider network failure is not automatically billed again', async () => {
  const h = await harness({ providerError: true });
  assert.equal((await h.run()).status, 503);
  assert.equal(h.calls.provider, 1);
  assert.equal(h.failures[0].metadata.stage, 'vectorize-attempt-1');
});

test('an explicit temporary provider rejection gets one bounded retry', async () => {
  const h = await harness({ temporaryRejection: true });
  assert.equal((await h.run()).status, 200);
  assert.equal(h.calls.provider, 2);
  assert.equal(h.calls.upload, 1);
});

test('permanent provider rejection is not retried and an incomplete SVG is never saved', async () => {
  for (const options of [{ providerStatus: 401 }, { invalidSvg: true }]) {
    const h = await harness(options);
    assert.equal((await h.run()).status, 500);
    assert.equal(h.calls.provider, 1);
    assert.equal(h.calls.upload, 0);
  }
});

test('unauthorized project access starts no downloads or provider requests', async () => {
  const h = await harness({ denied: true });
  assert.equal((await h.run()).status, 404);
  assert.equal(h.calls.provider, 0);
  assert.equal(h.calls.source, 0);
});
