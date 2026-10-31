import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { downloadUpscaleFile } from '../src/lib/upscaleDownload.mjs';
import { fetchWithSSRFProtection } from '../src/lib/ssrf.js';

const CHUNK = 8 * 1024 * 1024;
const PROBE = 64 * 1024;
const url = 'https://provider.test/output.png';
const hash = buffer => createHash('sha256').update(buffer).digest('hex');

function fixture(options = {}) {
  const bytes = Buffer.alloc(CHUNK * 4 + 127);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  const calls = [];
  let active = 0, peak = 0;
  const fetchAsset = async (_url, config) => {
    calls.push(config);
    const [, a, b] = config.fetchOptions.headers.Range.match(/bytes=(\d+)-(\d+)/);
    const start = Number(a), end = Math.min(Number(b), bytes.length - 1);
    if (options.ignoreRange) return { buffer: bytes, response: new Response(null, { status: 200, headers: { 'content-type': 'image/png' } }) };
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setTimeout(resolve, start === PROBE ? 4 : 1));
    active--;
    if (options.fail && start === PROBE) throw new Error('download interrupted');
    return {
      buffer: bytes.subarray(start, options.short && start > 0 ? end : end + 1),
      response: new Response(null, { status: 206, headers: {
        'content-type': 'image/png',
        'content-range': `bytes ${start}-${end}/${options.wrongTotal && start > 0 ? bytes.length + 1 : bytes.length}`,
        etag: options.changed && start > 0 ? '"different"' : '"original"',
      } }),
    };
  };
  return { bytes, calls, peak: () => peak, run: overrides => downloadUpscaleFile(url, { fetchAsset, allowedHosts: ['provider.test'], maxBytes: bytes.length, ...overrides }) };
}

test('concurrent chunk downloads assemble byte-identical output even when responses finish out of order', async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(hash(result.buffer), hash(f.bytes));
  assert.equal(f.peak(), 3);
  assert.equal(f.calls.length, 5);
  assert.equal(f.calls[0].fetchOptions.headers.Range, `bytes=0-${PROBE - 1}`);
  assert.equal(f.calls[1].fetchOptions.headers['If-Range'], '"original"');
  assert.ok(f.calls.every(call => call.timeoutMs > 30_000 && call.maxAttempts === 2));
});

test('hosts ignoring Range return their original bounded file unchanged', async () => {
  const f = fixture({ ignoreRange: true });
  assert.equal(hash((await f.run()).buffer), hash(f.bytes));
  assert.equal(f.calls.length, 1);
});

test('incomplete, oversized, mismatched, or changed ranges cannot produce a saved corrupted file', async () => {
  for (const options of [{ short: true }, { wrongTotal: true }, { changed: true }, { fail: true }]) {
    await assert.rejects(fixture(options).run());
  }
  const f = fixture();
  await assert.rejects(f.run({ maxBytes: 1024 }), /Invalid HD download range/);
});

test('aborting the download cancels remaining range reads', async () => {
  const controller = new AbortController();
  controller.abort(new Error('view deadline'));
  await assert.rejects(fixture().run({ signal: controller.signal }), /view deadline/);
});

test('a dropped chunk is retried through the protected reader without downloading completed chunks again', async () => {
  const bytes = Buffer.alloc(CHUNK * 2 + 17, 73);
  const calls = [];
  let failed = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_url, init) => {
    const range = new Headers(init.headers).get('range');
    calls.push(range);
    const [, a, b] = range.match(/bytes=(\d+)-(\d+)/);
    const start = Number(a), end = Math.min(Number(b), bytes.length - 1);
    if (start === PROBE && !failed) { failed = true; throw new TypeError('fetch failed'); }
    return new Response(bytes.subarray(start, end + 1), { status: 206, headers: {
      'content-type': 'image/png', 'content-range': `bytes ${start}-${end}/${bytes.length}`,
    } });
  };
  try {
    const result = await downloadUpscaleFile(url, {
      fetchAsset: (source, config) => fetchWithSSRFProtection(source, { ...config, retryDelayMs: 0 }),
      allowedHosts: ['provider.test'], maxBytes: bytes.length,
    });
    assert.equal(hash(result.buffer), hash(bytes));
    assert.equal(calls.filter(range => range === `bytes=0-${PROBE - 1}`).length, 1);
    assert.equal(calls.filter(range => range === `bytes=${PROBE}-${PROBE + CHUNK - 1}`).length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
