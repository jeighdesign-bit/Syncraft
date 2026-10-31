import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import JSZip from 'jszip';

const project = {
  id: 'project',
  user_id: 'owner',
  created_at: '2026-10-28T00:00:00.000Z',
  name: 'Complete Design',
  original_image_url: 'https://storage.test/users/owner/original.png',
  generated_image_url: 'https://storage.test/users/owner/generated.png',
  upscaled_image_url: 'https://storage.test/projects/project/upscaled.png',
  svg_url: 'https://storage.test/projects/project/vector.svg',
  zip_url: null,
  zip_signature: null,
};

async function harness(options = {}) {
  const calls = { downloads: [], upload: 0, update: 0, delete: 0, maxInFlight: 0 };
  let inFlight = 0;
  let uploadedBuffer;
  const source = (await readFile(new URL('../src/app/api/prepare-zip/route.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({
    Buffer, URL, Request, Response, Headers, AbortSignal, Date, Promise, JSZip, createHash,
    NextResponse: Response,
    console: { warn() {}, error() {} },
    PROJECT_ACCESS: { EDIT: 'edit' },
    DEFAULT_MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    DEFAULT_MAX_UPSCALED_IMAGE_BYTES: 96 * 1024 * 1024,
    DEFAULT_MAX_SVG_BYTES: 8 * 1024 * 1024,
    adminSupabase: {
      auth: { getUser: async () => ({ data: { user: { id: 'owner' } }, error: null }) },
      from: () => ({
        update: () => ({
          eq() { return this; },
          async abortSignal() { calls.update++; return { error: null }; },
        }),
      }),
    },
    enforceRateLimit: async () => ({ success: true }),
    getProjectAccess: async () => ({ project: { ...project, ...(options.project || {}) } }),
    isOwnedStorageUrl: url => options.unownedUrl !== url,
    fetchStoredAsset: async (url, settings) => {
      calls.downloads.push({ url, settings });
      inFlight++;
      calls.maxInFlight = Math.max(calls.maxInFlight, inFlight);
      await Promise.resolve();
      inFlight--;
      if (options.failureUrl === url) {
        const error = new Error('Remote file download timed out');
        error.name = 'TimeoutError';
        throw error;
      }
      const buffer = Buffer.from(`complete:${url}`);
      return { response: new Response(buffer, { headers: { 'content-type': url.endsWith('.svg') ? 'image/svg+xml' : 'image/png' } }), buffer };
    },
    uploadToR2: async (buffer, _key, _mime, settings) => {
      calls.upload++;
      calls.uploadSettings = settings;
      uploadedBuffer = buffer;
      return 'https://storage.test/projects/project/complete.zip';
    },
    deleteFromR2: async () => { calls.delete++; },
  });
  const { POST, assetSignature, maxDuration } = vm.runInContext(`${source}\n({POST, assetSignature, maxDuration})`, context);
  return {
    calls,
    assetSignature,
    maxDuration,
    get uploadedBuffer() { return uploadedBuffer; },
    async run() {
      const response = await POST(new Request('https://app.test/api/prepare-zip', {
        method: 'POST',
        headers: { authorization: 'Bearer session', 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'project' }),
      }));
      return { response, body: await response.clone().json() };
    },
  };
}

test('complete ZIP downloads every authorized asset concurrently and stores all files', async () => {
  const h = await harness();
  const { response, body } = await h.run();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(h.maxDuration, 180);
  assert.equal(h.calls.downloads.length, 4);
  assert.ok(h.calls.maxInFlight > 1);
  assert.equal(h.calls.upload, 1);
  assert.equal(h.calls.update, 1);
  assert.ok(h.calls.uploadSettings.signal);
  for (const { settings } of h.calls.downloads) {
    assert.equal(settings.timeoutMs, 25_000);
    assert.equal(settings.maxAttempts, 2);
  }
  const zip = await JSZip.loadAsync(h.uploadedBuffer);
  assert.deepEqual(Object.keys(zip.files).sort(), [
    'Syncraft_Complete_Design_Reference.png',
    'Syncraft_Complete_Design_SyncraftVision.png',
    'Syncraft_Complete_Design_Upscaled.png',
    'Syncraft_Complete_Design_Vector.svg',
  ].sort());
});

test('one timed-out asset fails atomically instead of publishing an incomplete ZIP', async () => {
  const h = await harness({ failureUrl: project.generated_image_url });
  const { response, body } = await h.run();
  assert.equal(response.status, 504);
  assert.equal(response.headers.get('retry-after'), '3');
  assert.equal(body.code, 'ZIP_ASSET_UNAVAILABLE');
  assert.deepEqual(body.failedFiles, ['Syncraft_Complete_Design_SyncraftVision.png']);
  assert.equal(h.calls.upload, 0);
  assert.equal(h.calls.update, 0);
});

test('unowned assets are rejected before any storage download', async () => {
  const h = await harness({ unownedUrl: project.upscaled_image_url });
  const { response } = await h.run();
  assert.equal(response.status, 403);
  assert.equal(h.calls.downloads.length, 0);
  assert.equal(h.calls.upload, 0);
});

test('the complete-archive signature invalidates ZIPs cached by the old partial-success route', async () => {
  const h = await harness();
  const assets = [
    { url: project.original_image_url, name: 'Reference.png' },
    { url: project.generated_image_url, name: 'Generated.png' },
  ];
  const oldSignature = createHash('sha256').update(JSON.stringify(assets)).digest('hex');
  assert.notEqual(h.assetSignature(assets), oldSignature);
});
