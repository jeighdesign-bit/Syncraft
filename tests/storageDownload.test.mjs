import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { isTransientFetchError } from '../src/lib/ssrf.js';

async function harness({ signedUrl = 'https://account.r2.cloudflarestorage.com/bucket/object?signature=private', failure, signal } = {}) {
  const calls = [];
  const source = (await readFile(new URL('../src/lib/storageDownload.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ URL, console: { warn() {} }, isTransientFetchError,
    getR2DownloadUrl: async () => signedUrl,
    getAllowedStorageHosts: () => ['public.r2.dev', 'storage.test'],
    fetchWithSSRFProtection: async (url, options) => {
      calls.push({ url, options });
      if (calls.length === 1 && failure) throw failure;
      return { buffer: Buffer.from('image') };
    },
  });
  const read = vm.runInContext(`${source}\nfetchStoredAsset`, context);
  return { calls, run: () => read('https://public.r2.dev/projects/id/upscale.png', { timeoutMs: 30000, signal }) };
}

test('owned R2 reads use the public CDN first instead of spending the deadline on the private endpoint', async () => {
  const h = await harness(); await h.run();
  assert.equal(h.calls.length, 1);
  assert.match(h.calls[0].url, /public\.r2\.dev/);
  assert.equal(h.calls[0].options.maxAttempts, 2);
  assert.deepEqual([...h.calls[0].options.allowedHosts], ['public.r2.dev', 'storage.test']);
});

test('an interrupted public read falls back once to authenticated storage', async () => {
  const h = await harness({ failure: new TypeError('terminated') }); await h.run();
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[1].options.maxAttempts, 1);
  assert.match(h.calls[1].url, /cloudflarestorage/);
  assert.deepEqual([...h.calls[1].options.allowedHosts], ['account.r2.cloudflarestorage.com']);
});

test('Supabase assets use bounded public downloads without signing another host', async () => {
  const h = await harness({ signedUrl: null }); await h.run();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.maxAttempts, 2);
});

test('private objects can still read through the authenticated fallback', async () => {
  const h = await harness({ failure: Object.assign(new Error('Remote file request failed (403)'), { status: 403 }) });
  await h.run();
  assert.equal(h.calls.length, 2);
  assert.match(h.calls[1].url, /cloudflarestorage/);
});

test('validation failures and caller cancellation never fall back', async () => {
  for (const options of [
    { failure: new Error('Remote file is too large') },
    { failure: new TypeError('terminated'), signal: AbortSignal.abort(new Error('deadline')) },
  ]) {
    const h = await harness(options);
    await assert.rejects(h.run());
    assert.equal(h.calls.length, 1);
  }
});
