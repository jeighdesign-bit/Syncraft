import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { buildLayeredPsd } from '../src/lib/layeredPsd.mjs';
import JSZip from 'jszip';
import sharp from 'sharp';
import { artworkExportAssets, artworkExportName, artworkImageFormat } from '../src/lib/artworkExport.mjs';
import { encodeArtworkImage } from '../src/lib/artworkExportServer.js';

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
    buildLayeredPsd, DEFAULT_MAX_ZIP_BYTES: 120 * 1024 * 1024,
    artworkExportAssets, artworkExportName, artworkImageFormat, encodeArtworkImage,
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
      const buffer = url.endsWith('.svg') ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><path d="M0 0h1v1z"/></svg>')
        : await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
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
    async run(format) {
      const response = await POST(new Request('https://app.test/api/prepare-zip', {
        method: 'POST',
        headers: { authorization: 'Bearer session', 'content-type': 'application/json' },
        body: JSON.stringify({ projectId: 'project', format }),
      }));
      return { response, body: await response.clone().json() };
    },
  };
}

test('final ZIP downloads the HD image and SVG concurrently, with no references or duplicate PNGs', async () => {
  const h = await harness();
  const { response, body } = await h.run();
  assert.equal(response.status, 200);
  assert.equal(body.success, true);
  assert.equal(h.maxDuration, 300);
  assert.equal(h.calls.downloads.length, 2);
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
    'Complete_Design.png',
    'Complete_Design.svg',
  ].sort());
});

test('one timed-out asset fails atomically instead of publishing an incomplete ZIP', async () => {
  const h = await harness({ failureUrl: project.upscaled_image_url });
  const { response, body } = await h.run();
  assert.equal(response.status, 504);
  assert.equal(response.headers.get('retry-after'), '3');
  assert.equal(body.code, 'ZIP_ASSET_UNAVAILABLE');
  assert.deepEqual(body.failedFiles, ['Complete_Design.png']);
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

test('JPEG ZIP contains a genuine white-backed JPEG plus SVG, never both image formats', async () => {
  const h = await harness();
  const { response, body } = await h.run('jpg');
  assert.equal(response.status, 200); assert.equal(body.fileName, 'Complete_Design.zip');
  const zip = await JSZip.loadAsync(h.uploadedBuffer);
  assert.deepEqual(Object.keys(zip.files).sort(), ['Complete_Design.jpg', 'Complete_Design.svg']);
  const jpg = await zip.file('Complete_Design.jpg').async('nodebuffer');
  assert.equal((await sharp(jpg).metadata()).format, 'jpeg');
  const pixels = await sharp(jpg).raw().toBuffer();
  assert.ok([...pixels].every(channel => channel >= 250));
});

test('single images bypass archive creation and unknown formats are rejected', async () => {
  const h = await harness({ project: { svg_url: null } });
  const { body } = await h.run('jpg');
  assert.equal(body.singleFile, true); assert.equal(body.format, 'jpg');
  assert.equal(h.calls.upload, 0); assert.equal(h.calls.downloads.length, 0);
  const invalid = await harness();
  assert.equal((await invalid.run('psd')).response.status, 400);
  assert.equal(invalid.calls.downloads.length, 0);
  const unfinished = await harness({ project: { upscaled_image_url: null, generated_image_url: 'REFUNDED', svg_url: null } });
  assert.equal((await unfinished.run()).response.status, 400);
});

test('cached packages are reused only for the exact source and image format', async () => {
  const first = await harness();
  const assets = artworkExportAssets(project, 'png');
  const signature = first.assetSignature(assets);
  const cached = await harness({ project: { zip_url: 'https://storage.test/projects/project/saved.zip', zip_signature: signature } });
  assert.equal((await cached.run('png')).body.cached, true);
  assert.equal(cached.calls.downloads.length, 0);
  assert.equal((await cached.run('jpg')).body.cached, false);
  assert.equal(cached.calls.upload, 1);
});

test('Download All packages each available export as a real file', async () => {
  for (const [changes, extensions] of [
    [{}, ['jpg', 'png', 'psd', 'svg']],
    [{ svg_url: null }, ['jpg', 'png']],
    [{ upscaled_image_url: null, generated_image_url: null }, ['psd', 'svg']],
  ]) {
    const h = await harness({ project: changes });
    assert.equal((await h.run('all')).response.status, 200);
    const zip = await JSZip.loadAsync(h.uploadedBuffer);
    assert.deepEqual(Object.keys(zip.files).sort(), extensions.map(ext => 'Complete_Design.' + ext));
    for (const ext of extensions) {
      const bytes = await zip.file('Complete_Design.' + ext).async('nodebuffer');
      if (ext === 'psd') assert.equal(bytes.toString('ascii', 0, 4), '8BPS');
      if (ext === 'jpg' || ext === 'png') assert.equal((await sharp(bytes).metadata()).format, ext === 'jpg' ? 'jpeg' : 'png');
    }
  }
});
