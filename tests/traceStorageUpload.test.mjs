import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

async function harness({ s3Failure = false } = {}) {
  const calls = [], clients = [], timeouts = [];
  class ObservedAbortSignal extends AbortSignal {
    static timeout(ms) { timeouts.push(ms); return AbortSignal.timeout(ms); }
  }
  const storageClient = { storage: { from: () => ({ upload: async () => ({ data: { path: 'projects/id/vector.svg' } }), getPublicUrl: () => ({ data: { publicUrl: 'https://storage.test/vector.svg' } }) }) } };
  class Command { constructor(input) { this.input = input; } }
  const source = (await readFile(new URL('../src/lib/cloudflare.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '')
    .replace("await import('@/lib/supabase')", 'supabaseDependencies')
    .replace("await import('@supabase/supabase-js')", 'clientDependency');
  const context = vm.createContext({ URL, AbortSignal: ObservedAbortSignal, setTimeout, console: { warn() {} },
    process: { env: { CF_ACCOUNT_ID: 'account', CF_R2_BUCKET_NAME: 'bucket', CF_R2_ACCESS_KEY_ID: 'key', CF_R2_SECRET_ACCESS_KEY: 'secret', CF_R2_PUBLIC_URL: 'https://public.r2.dev', NEXT_PUBLIC_SUPABASE_URL: 'https://storage.test', SUPABASE_SERVICE_ROLE_KEY: 'test' } },
    S3Client: class { async send(command, options) { calls.push({ command, options }); if (s3Failure) throw new TypeError('fetch failed'); } },
    PutObjectCommand: Command, GetObjectCommand: Command, DeleteObjectCommand: Command,
    getSignedUrl: async (_client, command) => { calls.push({ command }); return 'https://signed.test/object'; },
    supabaseDependencies: { adminSupabase: storageClient, adminStorageSupabase: storageClient, supabase: storageClient },
    clientDependency: { createClient: (_url, _key, options) => { clients.push(options); return storageClient; } },
  });
  const lib = vm.runInContext(`${source}\n({uploadToR2, getR2DownloadUrl})`, context);
  return { ...lib, calls, clients, timeouts };
}

test('authenticated downloads only sign URLs from the configured bucket', async () => {
  const h = await harness();
  assert.equal(await h.getR2DownloadUrl('https://untrusted.test/projects/id/vector.svg'), null);
  assert.equal(await h.getR2DownloadUrl('https://public.r2.dev/projects/id/vector.svg'), 'https://signed.test/object');
  assert.equal(h.calls[0].command.input.Key, 'projects/id/vector.svg');
  assert.equal(h.calls[0].command.input.Bucket, 'bucket');
});

test('SVG uploads pass a deadline to S3 and isolated fallback clients', async () => {
  const h = await harness({ s3Failure: true });
  const signal = new AbortController().signal;
  await h.uploadToR2(Buffer.from('svg'), 'projects/id/vector.svg', 'image/svg+xml', { signal });
  assert.ok(h.calls[0].options.abortSignal);
  assert.equal(h.clients.length, 2);
  assert.equal(typeof h.clients[0].global.fetch, 'function');
});

test('an expired upload deadline stops before falling back or retrying storage', async () => {
  const h = await harness({ s3Failure: true });
  await assert.rejects(h.uploadToR2(Buffer.from('svg'), 'projects/id/vector.svg', 'image/svg+xml', {
    signal: AbortSignal.abort(new Error('deadline')),
  }), /deadline/);
  assert.equal(h.clients.length, 0);
});

test('large HD files get a larger upload budget while preserving the original buffer', async () => {
  const h = await harness();
  const buffer = Buffer.alloc(58 * 1024 * 1024);
  await h.uploadToR2(buffer, 'projects/id/optimized.png', 'image/png');
  assert.equal(h.timeouts[0], 90_000);
  assert.equal(h.calls[0].command.input.Body, buffer);
  assert.equal(h.calls[0].command.input.ContentType, 'image/png');
  assert.equal(h.clients.length, 0);
});

test('small uploads retain a short upload deadline', async () => {
  const h = await harness();
  await h.uploadToR2(Buffer.from('small'), 'projects/id/small.png', 'image/png');
  assert.equal(h.timeouts[0], 10_000);
});
