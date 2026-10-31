import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import vm from 'node:vm';
import { downloadUpscaleFile } from '../src/lib/upscaleDownload.mjs';
import { optimizePngLosslessly } from '../src/lib/pngOptimization.mjs';

// Exercise the production state machine with an atomic in-memory database and
// provider transport. No real jobs are submitted and no credits are changed.
async function harness(options = {}) {
  const project = {
    id: 'project-1', user_id: 'owner', trace_type: options.native ? 'universal' : 'mockup',
    created_at: new Date().toISOString(), credits: 0,
    generated_image_url: 'https://storage.test/projects/project-1/flat.png',
    upscaled_image_url: null, svg_url: null,
  };
  const rows = [], usage = [], queries = [];
  const calls = { submit: 0, status: 0, result: 0, download: 0, upload: 0, nativeRead: 0, nativeResize: 0, charge: 0, refund: 0 };
  let queueStatus = options.queueStatus || 'IN_QUEUE';
  let downloadFailures = options.downloadFailures || 0;
  let statusFailures = options.statusFailures || 0;
  let statusFailureCode = options.statusFailureCode || 503;
  let persistenceFailures = options.persistenceFailures || 0;
  let submissionGate = null;
  let signingFailures = options.signingFailures || 0;
  const environment = { FAL_KEY: options.missingKey ? undefined : 'test-only' };
  const copy = value => value == null ? value : structuredClone(value);
  const field = (row, key) => key.split(/->>?/).reduce((value, part) => value?.[part.replaceAll('"', '')], row);
  const adminSupabase = { from(table) {
    const filters = [];
    const query = {
      operation: 'select', value: null, executed: null,
      select() { return this; },
      insert(value) { this.operation = 'insert'; this.value = value; return this; },
      update(value) { this.operation = 'update'; this.value = value; return this; },
      eq(key, value) { filters.push(row => field(row, key) === value); return this; },
      neq(key, value) { filters.push(row => field(row, key) !== value); return this; },
      in(key, values) { filters.push(row => values.includes(field(row, key))); return this; },
      is(key, value) { filters.push(row => field(row, key) === value); return this; },
      contains(key, values) { filters.push(row => Object.entries(values).every(([k, value]) => row[key]?.[k] === value)); return this; },
      gte() { return this; }, order() { return this; }, limit() { return this; }, abortSignal() { return this; },
      async single() { return this.execute(true); }, async maybeSingle() { return this.execute(true); },
      then(resolve, reject) { return Promise.resolve(this.execute(false)).then(resolve, reject); },
      execute(single) {
        if (this.executed) return this.executed;
        queries.push({ table, operation: this.operation });
        if (!['provider_usage_logs', 'projects'].includes(table)) throw new Error(`Unexpected table ${table}`);
        if (table === 'provider_usage_logs' && this.operation === 'insert') {
          const values = Array.isArray(this.value) ? this.value : [this.value];
          const inserted = [];
          for (const value of values) {
            if (rows.some(row => row.provider === value.provider && row.provider_request_id === value.provider_request_id)) {
              return this.executed = { data: null, error: { code: '23505', message: 'duplicate reservation' } };
            }
            const row = { id: randomUUID(), created_at: new Date().toISOString(), ...copy(value) };
            rows.push(row); inserted.push(row);
          }
          return this.executed = { data: copy(single ? inserted[0] : inserted), error: null };
        }
        const matches = (table === 'projects' ? [project] : rows).filter(row => filters.every(fn => fn(row)));
        if (this.operation === 'update') {
          if (table === 'provider_usage_logs' && this.value.metadata?.request_id && persistenceFailures > 0) {
            persistenceFailures--;
            return this.executed = { data: null, error: { message: 'database write interrupted' } };
          }
          matches.forEach(row => Object.assign(row, copy(this.value)));
        }
        return this.executed = { data: copy(single ? matches[0] || null : matches), error: null };
      },
    };
    return query;
  } };
  const source = (await readFile(new URL('../src/lib/traceUpscaleJobs.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({
    Buffer, URL, Blob, FormData, Headers, Response, AbortSignal, AbortController, DOMException, Date,
    createHash, randomUUID, setTimeout, clearTimeout, structuredClone,
    console: { info() {}, warn() {}, error() {}, log() {} },
    process: { env: environment }, adminSupabase, downloadUpscaleFile, optimizePngLosslessly,
    DEFAULT_MAX_UPSCALED_IMAGE_BYTES: 96 * 1024 * 1024, DEFAULT_MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    getR2DownloadUrl: async url => {
      if (signingFailures > 0) { signingFailures--; throw new Error('signing unavailable'); }
      return url;
    },
    getAllowedProviderHosts: () => ['provider.test'],
    usesNativeTraceUpscale: () => options.native === true,
    resizeTraceForUpscale: async buffer => { calls.nativeResize++; return buffer; },
    findLatestProjectCharge: async () => ({ transactionId: 'original-charge', isOwnerTest: false }),
    recordProviderUsage: async row => { usage.push(copy(row)); return true; },
    chargeCreditsVerified: async () => { calls.charge++; throw new Error('Upscale must not charge'); },
    refundCreditVerified: async () => { calls.refund++; throw new Error('Upscale must not refund'); },
    fetchStoredAsset: async () => { calls.nativeRead++; return { response: { ok: true, headers: new Headers({ 'content-type': 'image/png' }) }, buffer: Buffer.from('native-source') }; },
    fetchWithSSRFProtection: async () => {
      calls.download++;
      if (downloadFailures > 0) { downloadFailures--; throw new TypeError('terminated'); }
      return { response: { ok: true, status: 200, headers: new Headers({ 'content-type': 'image/png' }) }, buffer: Buffer.from('upscale-result') };
    },
    uploadToR2: async (_buffer, key) => { calls.upload++; return `https://storage.test/${key}`; },
    fetch: async (url, init = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      if (method === 'POST') {
        calls.submit++;
        if (submissionGate) await submissionGate;
        if (options.submitError) throw new TypeError('fetch failed');
        if (options.submitBodyError) {
          const body = new ReadableStream({ start(controller) { controller.error(new TypeError('terminated')); } });
          return new Response(body, { status: 202, headers: { 'content-type': 'application/json' } });
        }
        if (options.submitStatus) return new Response('provider rejection', { status: options.submitStatus });
        return Response.json({ request_id: `fal-request-${calls.submit}`, status: 'IN_QUEUE', queue_position: 2 }, { status: 202 });
      }
      if (String(url).includes('/status')) {
        calls.status++;
        if (statusFailures > 0) { statusFailures--; return new Response('status read unavailable', { status: statusFailureCode }); }
        return Response.json({ request_id: 'fal-request-1', status: queueStatus, queue_position: queueStatus === 'IN_QUEUE' ? 2 : undefined });
      }
      calls.result++;
      return Response.json({ image: { url: 'https://provider.test/upscaled.png', content_type: 'image/png', width: 4096, height: 4096 } });
    },
  });
  const service = vm.runInContext(`${source}\n({ startTraceUpscale, getTraceUpscaleStatus, saveTraceUpscale })`, context);
  return { service, project, rows, usage, queries, calls,
    snapshot: () => copy(project),
    status: value => { queueStatus = value; },
    configureKey: value => { environment.FAL_KEY = value; },
    holdSubmission: () => {
      let release;
      submissionGate = new Promise(resolve => { release = resolve; });
      return () => { submissionGate = null; release(); };
    },
    start: () => service.startTraceUpscale(copy(project), 'owner'),
    poll: () => service.getTraceUpscaleStatus(copy(project)),
    save: () => service.saveTraceUpscale(copy(project)),
  };
}

test('concurrent starts reserve one durable job and submit only one provider request', async () => {
  const h = await harness();
  const results = await Promise.all([h.start(), h.start(), h.start()]);
  assert.equal(h.calls.submit, 1);
  assert.equal(h.rows.filter(row => row.provider === 'syncraft_upscale').length, 1);
  assert.equal(h.rows[0].metadata.request_id, 'fal-request-1');
  assert.ok(results.every(result => ['submitting', 'queued', 'running'].includes(result.status)));
});

test('refresh and resume reconnect to the saved provider request instead of submitting again', async () => {
  const h = await harness();
  await h.start();
  h.status('IN_PROGRESS');
  const progress = await h.poll();
  assert.equal(progress.status, 'running');
  await h.start();
  assert.equal(h.calls.submit, 1);
  assert.equal(h.rows[0].metadata.request_id, 'fal-request-1');
  assert.doesNotMatch(JSON.stringify(progress), /fal-request-1|source_url|lease_token|output_url/);
});

test('a lost submission connection or response body is never automatically submitted again', async () => {
  for (const options of [{ submitError: true }, { submitBodyError: true }]) {
    const h = await harness(options);
    await assert.rejects(h.start(), error => error.code === 'UPSCALE_SUBMISSION_UNCONFIRMED');
    assert.equal(h.rows[0].request_status, 'submission_unknown');
    await assert.rejects(h.start(), error => error.code === 'UPSCALE_SUBMISSION_UNCONFIRMED');
    assert.equal(h.calls.submit, 1);
  }
});

test('explicit provider rejection records failure without automatic replay', async () => {
  for (const submitStatus of [400, 401, 402, 403, 422, 429]) {
    const h = await harness({ submitStatus });
    await assert.rejects(h.start());
    assert.equal(h.calls.submit, 1);
    assert.equal(h.rows[0].request_status, 'failed');
  }
});

test('provider 5xx submission errors retain ambiguity and cannot be replayed', async () => {
  for (const submitStatus of [500, 502, 503, 504]) {
    const h = await harness({ submitStatus });
    await assert.rejects(h.start(), error => error.code === 'UPSCALE_SUBMISSION_UNCONFIRMED');
    assert.equal(h.rows[0].request_status, 'submission_unknown');
    await assert.rejects(h.start(), error => error.code === 'UPSCALE_SUBMISSION_UNCONFIRMED');
    assert.equal(h.calls.submit, 1);
  }
});

test('preflight failures before submission can be safely retried after configuration recovers', async () => {
  for (const options of [{ missingKey: true }, { signingFailures: 1 }]) {
    const h = await harness(options);
    await assert.rejects(h.start(), error => error.code === 'UPSCALE_PROVIDER_FAILED');
    assert.equal(h.rows[0].request_status, 'failed');
    assert.equal(h.calls.submit, 0);
    h.configureKey('restored-test-key');
    assert.equal((await h.start()).status, 'queued');
    assert.equal(h.calls.submit, 1);
  }
});

test('completed output is persisted before saving and a failed download can resume without another AI job', async () => {
  const h = await harness({ downloadFailures: 1 });
  await h.start(); h.status('COMPLETED');
  assert.equal((await h.poll()).status, 'ready');
  assert.equal(h.rows[0].metadata.output_url, 'https://provider.test/upscaled.png');
  await assert.rejects(h.save(), error => error.code === 'UPSCALE_SAVE_INTERRUPTED');
  const saved = await h.save();
  assert.equal(saved.status, 'succeeded');
  assert.equal(saved.alreadySaved, true);
  assert.match(saved.fileUrl, /^https:\/\/storage\.test\//);
  assert.equal(h.calls.submit, 1);
  assert.equal(h.calls.result, 1);
  assert.equal(h.calls.download, 2);
  assert.equal(h.calls.upload, 1);
  assert.equal(h.project.upscaled_image_url, saved.fileUrl);
  for (const stage of ['download', 'optimize-png', 'upload', 'save-project']) {
    assert.ok(h.rows[0].metadata.save_timings_ms[stage] >= 0);
  }
  assert.ok(h.rows[0].metadata.save_total_ms >= 0);
  assert.ok(Number.isFinite(Date.parse(h.rows[0].metadata.save_completed_at)));
});

test('a source changed during saving is not overwritten by an old upscale', async () => {
  const h = await harness();
  await h.start(); h.status('COMPLETED'); await h.poll();
  const oldProject = h.snapshot();
  h.project.generated_image_url = 'https://storage.test/projects/project-1/extended.png';
  await assert.rejects(h.service.saveTraceUpscale(oldProject));
  assert.equal(h.project.upscaled_image_url, null);
  assert.match(h.project.generated_image_url, /extended/);
  assert.equal(h.rows[0].request_status, 'superseded');
});

test('reverting to a superseded source reconnects to its known job or output without another submission', async () => {
  for (const state of ['queued', 'ready']) {
    const h = await harness();
    const source = h.project.generated_image_url;
    await h.start();
    if (state === 'ready') { h.status('COMPLETED'); await h.poll(); }
    h.project.generated_image_url = 'https://storage.test/projects/project-1/extended.png';
    h.rows[0].request_status = 'superseded';
    h.project.generated_image_url = source;
    assert.equal((await h.start()).status, state);
    assert.equal(h.rows[0].metadata.request_id, 'fal-request-1');
    assert.equal(h.calls.submit, 1);
    h.status('COMPLETED');
    await h.poll();
    assert.equal((await h.save()).status, 'succeeded');
    assert.equal(h.calls.submit, 1);
  }
});

test('clearing a completed project upscale can restore the saved output without another provider job', async () => {
  const h = await harness();
  await h.start(); h.status('COMPLETED'); await h.poll();
  assert.equal((await h.save()).status, 'succeeded');
  h.project.upscaled_image_url = null;
  assert.equal((await h.start()).status, 'ready');
  assert.equal((await h.save()).status, 'succeeded');
  assert.equal(h.calls.submit, 1);
  assert.equal(h.calls.result, 1);
  assert.equal(h.calls.upload, 2);
});

test('a new source reserves a different job while reusing the old source never creates a duplicate', async () => {
  const h = await harness();
  const oldProject = h.snapshot();
  await h.start();
  h.project.generated_image_url = 'https://storage.test/projects/project-1/extended.png';
  await h.start();
  assert.equal(h.calls.submit, 2);
  assert.equal(new Set(h.rows.map(row => row.provider_request_id)).size, 2);
  await h.service.startTraceUpscale(oldProject, 'owner');
  assert.equal(h.calls.submit, 2);
});

test('zero-credit accounts can complete an already-paid upscale without a new charge or refund', async () => {
  const h = await harness();
  await h.start(); h.status('COMPLETED'); await h.poll();
  assert.equal((await h.save()).status, 'succeeded');
  assert.equal(h.calls.charge, 0);
  assert.equal(h.calls.refund, 0);
  assert.equal(h.project.credits, 0);
});

test('native recovery reserves and saves without sending a paid provider request', async () => {
  const h = await harness({ native: true });
  assert.equal((await h.start()).status, 'ready');
  assert.equal((await h.save()).status, 'succeeded');
  assert.equal(h.calls.submit, 0);
  assert.equal(h.calls.nativeRead, 1);
  assert.equal(h.calls.nativeResize, 1);
});

test('a retry of a failed native job returns directly to ready without waiting for a provider', async () => {
  const h = await harness({ native: true });
  await h.start();
  h.rows[0].request_status = 'failed';
  assert.equal((await h.start()).status, 'ready');
  assert.equal((await h.save()).status, 'succeeded');
  assert.equal(h.calls.submit, 0);
});

test('temporary status errors preserve the provider job for a later poll', async () => {
  const h = await harness({ statusFailures: 1 });
  await h.start();
  await assert.rejects(h.poll());
  h.status('IN_PROGRESS');
  assert.equal((await h.poll()).status, 'running');
  assert.equal(h.rows[0].metadata.request_id, 'fal-request-1');
  assert.equal(h.calls.submit, 1);
});

test('authentication failures while checking status preserve the known job instead of enabling a duplicate', async () => {
  for (const statusFailureCode of [401, 403, 404]) {
    const h = await harness({ statusFailures: 1, statusFailureCode });
    await h.start();
    await assert.rejects(h.poll(), error => error.code === 'UPSCALE_STATUS_UNAVAILABLE');
    assert.equal(h.rows[0].request_status, 'queued');
    assert.equal(h.rows[0].metadata.request_id, 'fal-request-1');
    assert.equal((await h.start()).status, 'queued');
    h.status('IN_PROGRESS');
    assert.equal((await h.poll()).status, 'running');
    assert.equal(h.calls.submit, 1);
  }
});

test('retrying an old definitely-failed job starts a fresh attempt age for concurrent progress reads', async () => {
  const h = await harness();
  await h.start();
  const old = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  h.rows[0].created_at = old;
  h.rows[0].metadata.attempt_started_at = old;
  h.rows[0].request_status = 'failed';
  const release = h.holdSubmission();
  const resuming = h.start();
  await new Promise(setImmediate);
  try {
    assert.equal((await h.poll()).status, 'submitting');
    assert.ok(Date.parse(h.rows[0].metadata.attempt_started_at) > Date.now() - 30_000);
  } finally {
    release();
    await resuming;
  }
  assert.equal(h.calls.submit, 2);
  assert.equal(h.rows[0].metadata.request_id, 'fal-request-2');
});

test('concurrent finalizers claim one save lease and upload the result only once', async () => {
  const h = await harness();
  await h.start(); h.status('COMPLETED'); await h.poll();
  const results = await Promise.all([h.save(), h.save(), h.save()]);
  assert.ok(results.every(result => ['saving', 'succeeded'].includes(result.status)));
  assert.equal(h.calls.submit, 1);
  assert.equal(h.calls.download, 1);
  assert.equal(h.calls.upload, 1);
});

test('a recoverable request-ID persistence failure does not submit a second AI job', async () => {
  const h = await harness({ persistenceFailures: 1 });
  await assert.rejects(h.start(), error => error.code === 'UPSCALE_STORAGE_UNAVAILABLE');
  assert.equal(h.rows[0].metadata.request_id, 'fal-request-1');
  assert.equal((await h.start()).status, 'queued');
  assert.equal(h.calls.submit, 1);
});

test('an expired save lease resumes the stored output without re-submitting the provider job', async () => {
  const h = await harness();
  await h.start(); h.status('COMPLETED'); await h.poll();
  h.rows[0].request_status = 'saving';
  h.rows[0].metadata.lease_token = 'abandoned-lease';
  h.rows[0].metadata.lease_until = new Date(Date.now() - 1000).toISOString();
  assert.equal((await h.save()).status, 'succeeded');
  assert.equal(h.calls.submit, 1);
  assert.equal(h.calls.upload, 1);
});
