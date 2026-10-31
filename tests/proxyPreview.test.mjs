import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
import { isTransientFetchError } from '../src/lib/ssrf.js';
import { assertSafeSvg } from '../src/lib/svgSafety.mjs';

async function harness(options = {}) {
  const buffer = options.buffer || await sharp({ create: {
    width: options.width || 1800, height: options.height || 900,
    channels: 4, background: { r: 18, g: 73, b: 140, alpha: 0.7 },
  } }).png().toBuffer();
  const calls = [], redirects = [];
  class NextResponse extends Response {
    static redirect(url, status) { redirects.push(url); return new NextResponse(null, { status: status || 307, headers: { location: url } }); }
  }
  const source = (await readFile(new URL('../src/app/api/proxy/route.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '')
    .replace(/const\s+sharp\s*=\s*\(await import\(['"]sharp['"]\)\)\.default;/g, '');
  const context = vm.createContext({
    Buffer, URL, Response, Headers, AbortSignal, AbortController, NextResponse, sharp, Date, assertSafeSvg,
    console: { warn() {}, error() {}, info() {} },
    process: { env: { CF_R2_PUBLIC_URL: 'https://public.r2.dev', CF_ACCOUNT_ID: 'account', CF_R2_BUCKET_NAME: 'bucket', NEXT_PUBLIC_SUPABASE_URL: 'https://storage.test' } },
    DEFAULT_MAX_IMAGE_BYTES: 15 * 1024 * 1024, DEFAULT_MAX_UPSCALED_IMAGE_BYTES: 96 * 1024 * 1024,
    DEFAULT_MAX_SVG_BYTES: 8 * 1024 * 1024, DEFAULT_MAX_PSD_BYTES: 256 * 1024 * 1024, DEFAULT_MAX_ZIP_BYTES: 120 * 1024 * 1024,
    getAllowedStorageHosts: () => ['public.r2.dev', 'storage.test'], isTransientFetchError,
    validateUrlForSSRF: async (url, { allowedHosts }) => {
      const parsed = new URL(url);
      return !options.validationFalse && !parsed.username && !parsed.password
        && ['http:', 'https:'].includes(parsed.protocol) && allowedHosts.includes(parsed.hostname);
    },
    fetchStoredAsset: async (url, config) => {
      calls.push({ url, config });
      if (options.gate) await options.gate;
      if (options.error) throw options.error;
      return { buffer, response: new Response(buffer, { headers: {
        'content-type': options.mime || 'image/png', 'content-length': String(buffer.length),
      } }) };
    },
    fetch: async () => { throw new Error('Proxy must use bounded authenticated storage reads'); },
  });
  const get = vm.runInContext(`${source}\nGET`, context);
  return { calls, redirects, original: buffer, run: (params = {}, sourceUrl = 'https://public.r2.dev/projects/id/upscaled_job.png') => {
    const search = new URLSearchParams({ url: sourceUrl, ...params });
    return get(new Request(`https://app.test/api/proxy?${search}`));
  } };
}

test('raster previews are bounded WebP images while preserving aspect ratio and transparency', async () => {
  const h = await harness();
  const response = await h.run({ preview: '1' });
  const preview = Buffer.from(await response.arrayBuffer());
  const metadata = await sharp(preview).metadata();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1600);
  assert.equal(metadata.height, 800);
  assert.equal(metadata.hasAlpha, true);
  assert.equal(Number(response.headers.get('content-length')), preview.length);
  assert.match(response.headers.get('cache-control'), /public/);
  assert.equal(h.calls[0].config.maxBytes, 96 * 1024 * 1024);
  assert.equal(h.calls[0].config.timeoutMs, 25_000);
  assert.equal(h.calls[0].config.maxAttempts, 2);
  assert.equal(h.calls[0].config.signal.aborted, false);
});

test('small previews are not enlarged', async () => {
  const h = await harness({ width: 320, height: 640 });
  const response = await h.run({ preview: '1' });
  const metadata = await sharp(Buffer.from(await response.arrayBuffer())).metadata();
  assert.equal(metadata.width, 320);
  assert.equal(metadata.height, 640);
});

test('SVG display previews return a cacheable lossless bitmap with the original faint colors', async () => {
  const original = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path fill="#f8e6c9" d="M0 0h100v100H0z"/><path fill="#f0dcbf" d="M28 8h6v80h-6z"/></svg>');
  const h = await harness({ buffer: original, mime: 'image/svg+xml' });
  const response = await h.run({ preview: '1', svgPreview: '1' }, 'https://public.r2.dev/projects/id/vector.svg');
  const bitmap = Buffer.from(await response.arrayBuffer());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.equal(response.headers.get('x-preview-only'), '1');
  assert.match(response.headers.get('cache-control'), /max-age=86400/);
  assert.deepEqual(await sharp(bitmap).ensureAlpha().raw().toBuffer(), await sharp(original).ensureAlpha().raw().toBuffer());
});

test('explicit SVG downloads ignore bitmap preview flags and retain the full vector document', async () => {
  const original = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><path d="M0 0h10v10z"/></svg>');
  const h = await harness({ buffer: original, mime: 'image/svg+xml' });
  const response = await h.run({ preview: '1', svgPreview: '1', download: 'artwork.svg' }, 'https://public.r2.dev/projects/id/vector.svg');
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  assert.equal(response.headers.get('x-preview-only'), null);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), original);
});

test('SVG bitmap rendering rejects active content and external resources before decoding', async () => {
  for (const content of ['<script>alert(1)</script>', '<image href="file:///private.png"/>', '<image href="https://untrusted.test/image.png"/>']) {
    const h = await harness({ buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`), mime: 'image/svg+xml' });
    const response = await h.run({ preview: '1', svgPreview: '1' }, 'https://public.r2.dev/projects/id/vector.svg');
    assert.equal(response.status, 415);
  }
});

test('original PNG requests and explicit downloads retain the exact source bytes', async () => {
  for (const params of [{}, { preview: '1', download: 'Original artwork.png' }]) {
    const h = await harness();
    const response = await h.run(params);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), h.original);
    if (params.download) assert.match(response.headers.get('content-disposition'), /attachment; filename="Original_artwork.png"/);
  }
});

test('SVG previews stay vector-native and retain the legacy Illustrator label repair', async () => {
  const h = await harness({ buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><g inkscape:label="old"><path d="M0 0h1v1z" /></g></svg>'), mime: 'application/octet-stream' });
  const response = await h.run({ preview: '1' }, 'https://public.r2.dev/projects/id/vector.svg');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/svg+xml');
  const text = await response.text();
  assert.match(text, /<svg/);
  assert.doesNotMatch(text, /inkscape:label/);
});

test('ZIP and PSD downloads retain their binary content and established MIME types', async () => {
  for (const [extension, mime] of [['zip', 'application/zip'], ['psd', 'application/vnd.adobe.photoshop']]) {
    const h = await harness({ buffer: Buffer.from('unchanged binary payload'), mime: 'application/octet-stream' });
    const response = await h.run({ download: `artwork.${extension}` }, `https://public.r2.dev/projects/id/artwork.${extension}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), mime);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), h.original);
  }
});

test('preview transforms reject ZIP and PSD before fetching large source files', async () => {
  for (const extension of ['zip', 'psd']) {
    const h = await harness({ buffer: Buffer.from('unused') });
    assert.equal((await h.run({ preview: '1' }, `https://public.r2.dev/projects/id/artwork.${extension}`)).status, 400);
    assert.equal(h.calls.length, 0);
  }
});

test('unauthorized hosts and URL credentials are blocked before storage reads', async () => {
  for (const url of ['https://untrusted.test/private.png', 'https://user:secret@public.r2.dev/projects/id/image.png', 'ftp://public.r2.dev/projects/id/image.png']) {
    const h = await harness({ buffer: Buffer.from('unused') });
    assert.equal((await h.run({ preview: '1' }, url)).status, 403);
    assert.equal(h.calls.length, 0);
  }
});

test('the response is not returned until the complete upstream file has been received', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const h = await harness({ gate });
  let responded = false;
  const pending = h.run().then(response => { responded = true; return response; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(responded, false);
  release();
  const response = await pending;
  assert.equal(response.status, 200);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), h.original);
});

test('interrupted transfers fail cleanly rather than returning partial HTTP 200 or redirecting to public storage', async () => {
  for (const error of [new TypeError('terminated'), new TypeError('fetch failed'), Object.assign(new Error('download timed out'), { name: 'TimeoutError' })]) {
    const h = await harness({ error });
    const response = await h.run({ preview: '1' });
    assert.ok([503, 504].includes(response.status));
    assert.equal(response.headers.get('retry-after'), '2');
    assert.equal(response.headers.get('location'), null);
    assert.equal(h.redirects.length, 0);
    assert.ok((await response.text()).length > 0);
  }
});

test('bounded file validation errors retain useful HTTP error codes', async () => {
  for (const [message, status] of [['Remote file is too large', 413], ['Remote file has an invalid content type', 415], ['Invalid or unauthorized URL', 403]]) {
    const h = await harness({ error: new Error(message) });
    assert.equal((await h.run({ preview: '1' })).status, status);
    assert.equal(h.redirects.length, 0);
  }
});
