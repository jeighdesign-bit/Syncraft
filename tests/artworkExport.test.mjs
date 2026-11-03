import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { finalArtworkRaster, artworkExportName, artworkImageFormat } from '../src/lib/artworkExport.mjs';
import { encodeArtworkImage } from '../src/lib/artworkExportServer.js';

test('final image selection prefers HD, falls back to generated artwork, and never exports reference-only or refunded jobs', () => {
  assert.equal(finalArtworkRaster({ original_image_url: 'reference', generated_image_url: 'result', upscaled_image_url: 'hd' }), 'hd');
  assert.equal(finalArtworkRaster({ original_image_url: 'reference', generated_image_url: 'result' }), 'result');
  assert.equal(finalArtworkRaster({ original_image_url: 'reference', generated_image_url: 'REFUNDED' }), null);
  assert.equal(finalArtworkRaster({ original_image_url: 'reference' }), null);
});

const png = await sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();

async function imageRoute(options = {}) {
  const source = (await readFile(new URL('../src/app/api/export-image/route.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const calls = [];
  const project = { id: 'project', user_id: 'owner', name: 'Final Design', generated_image_url: 'https://storage.test/generated.png', upscaled_image_url: 'https://storage.test/hd.png', ...options.project };
  const { POST } = vm.runInNewContext(`${source}\n({POST})`, {
    Response, NextResponse: Response, AbortSignal, console: { error() {} },
    finalArtworkRaster, artworkExportName, artworkImageFormat, encodeArtworkImage,
    adminSupabase: { auth: { getUser: async () => ({ data: { user: options.invalidSession ? null : { id: 'editor' } } }) } },
    enforceRateLimit: async () => ({ success: true }), PROJECT_ACCESS: { EDIT: 'edit' },
    getProjectAccess: async (_id, _projectId, access) => { calls.push({ access }); return { project: options.denied ? null : project }; },
    isOwnedStorageUrl: (url, owner) => !options.unowned && url.startsWith('https://storage.test/') && owner.userId === 'owner',
    DEFAULT_MAX_UPSCALED_IMAGE_BYTES: 96 * 1024 * 1024,
    fetchStoredAsset: async (url, limits) => { calls.push({ url, limits }); return { response: { ok: true }, buffer: png }; },
  });
  return { calls, run: (format = 'png', token = 'session') => POST(new Request('https://app.test/api/export-image', { method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ projectId: 'project', format }) })) };
}

test('direct PNG preserves transparency and JPEG has genuine JPEG bytes with a white background', async () => {
  for (const format of ['png', 'jpg']) {
    const h = await imageRoute();
    const response = await h.run(format);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-disposition'), new RegExp(`Final_Design\\.${format}`));
    assert.equal(response.headers.get('content-type'), format === 'jpg' ? 'image/jpeg' : 'image/png');
    const bytes = Buffer.from(await response.arrayBuffer());
    const metadata = await sharp(bytes).metadata();
    assert.equal(metadata.format, format === 'jpg' ? 'jpeg' : 'png');
    const raw = await sharp(bytes).raw().toBuffer();
    if (format === 'jpg') assert.ok([...raw].every(channel => channel >= 250));
    else { assert.equal(metadata.hasAlpha, true); assert.equal(raw[3], 0); }
    assert.equal(h.calls[0].access.required, 'edit');
    assert.equal(h.calls[1].url, 'https://storage.test/hd.png');
    assert.equal(h.calls[1].limits.maxBytes, 96 * 1024 * 1024);
  }
});

test('image exports reject unauthorized, invalid, reference-only and unowned requests before storage reads', async () => {
  for (const [options, format, token, status] of [
    [{}, 'png', '', 401], [{ invalidSession: true }, 'png', 'session', 401],
    [{ denied: true }, 'png', 'session', 404], [{ unowned: true }, 'jpg', 'session', 403],
    [{}, 'psd', 'session', 400], [{ project: { generated_image_url: 'REFUNDED', upscaled_image_url: null } }, 'png', 'session', 409],
  ]) {
    const h = await imageRoute(options);
    assert.equal((await h.run(format, token)).status, status);
    assert.equal(h.calls.filter(call => call.url).length, 0);
  }
});
