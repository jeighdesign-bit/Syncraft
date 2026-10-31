import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForTraceUpscale, waitForUpscalePoll, upscaleProgressMessage } from '../src/lib/traceUpscaleClient.mjs';

function harness(sequence, options = {}) {
  const actions = [], waits = [], progress = [];
  let time = 0;
  let index = 0;
  const request = async action => {
    actions.push(action);
    const next = sequence[Math.min(index++, sequence.length - 1)];
    if (next instanceof Error) throw next;
    return { ...next };
  };
  return {
    actions, waits, progress,
    run: overrides => waitForTraceUpscale({
      request,
      wait: async ms => { waits.push(ms); time += ms; },
      now: () => time,
      onProgress: state => progress.push(state),
      ...options, ...overrides,
    }),
  };
}

const saved = { status: 'succeeded', fileUrl: 'https://storage.test/upscaled.png', alreadySaved: true };

test('queued jobs poll through running and ready before saving the completed HD file', async () => {
  const h = harness([
    { status: 'queued', elapsedSeconds: 0, queuePosition: 2 },
    { status: 'running', elapsedSeconds: 3 },
    { status: 'ready', elapsedSeconds: 6 },
    saved,
  ]);
  assert.deepEqual(await h.run(), saved);
  assert.deepEqual(h.actions, ['start', 'status', 'status', 'save']);
  assert.deepEqual(h.waits, [3000, 3000]);
  assert.deepEqual(h.progress.map(state => state.status), ['queued', 'running', 'ready']);
  assert.match(h.progress[0].message, /Waiting for AI.*Queue position 3/);
});

test('another tab saving the same output is checked at a slower interval without starting a new job', async () => {
  const h = harness([{ status: 'saving', elapsedSeconds: 20 }, saved]);
  assert.equal((await h.run({ existingOnly: true })).status, 'succeeded');
  assert.deepEqual(h.actions, ['status', 'save']);
  assert.deepEqual(h.waits, [12000]);
});

test('an existing-only reconnect with no saved job never submits paid work', async () => {
  const h = harness([{ status: 'none' }]);
  assert.equal(await h.run({ existingOnly: true }), null);
  assert.deepEqual(h.actions, ['status']);
  assert.deepEqual(h.waits, []);
});

test('an initial ready result resumes saving immediately without submitting or polling again', async () => {
  const h = harness([saved]);
  assert.equal((await h.run({ existingOnly: true, initialStatus: { status: 'ready', elapsedSeconds: 80 } })).fileUrl, saved.fileUrl);
  assert.deepEqual(h.actions, ['save']);
  assert.deepEqual(h.waits, []);
});

test('a lost start response retries the same reserved start action and then resumes progress', async () => {
  const lostResponse = Object.assign(new Error('connection interrupted'), { code: 'REQUEST_NETWORK_FAILED' });
  const h = harness([lostResponse, { status: 'queued' }, { status: 'ready' }, saved]);
  assert.equal((await h.run()).status, 'succeeded');
  assert.deepEqual(h.actions, ['start', 'start', 'status', 'save']);
  assert.equal(h.progress[0].message, 'Reconnecting to your saved upscale job…');
  assert.deepEqual(h.waits, [2500, 3000]);
});

test('temporary status and saving errors resume the same action rather than creating another upscale', async () => {
  for (const code of ['REQUEST_TIMEOUT', 'UPSCALE_STATUS_UNAVAILABLE', 'UPSCALE_STORAGE_UNAVAILABLE', 'UPSCALE_SAVE_INTERRUPTED']) {
    const interrupted = Object.assign(new Error('temporary interruption'), { code });
    const h = harness([interrupted, saved]);
    await h.run({ existingOnly: true, initialStatus: { status: 'ready' } });
    assert.deepEqual(h.actions, ['save', 'save']);
    assert.deepEqual(h.waits, [2500]);
  }
});

test('rate-limited status checks back off and remain attached to the saved job', async () => {
  const throttled = Object.assign(new Error('rate limited'), { status: 429 });
  const h = harness([throttled, saved]);
  await h.run({ existingOnly: true });
  assert.deepEqual(h.actions, ['status', 'status']);
  assert.deepEqual(h.waits, [2500]);
});

test('ambiguous submission and authentication failures stop without automatic resubmission', async () => {
  for (const code of ['UPSCALE_SUBMISSION_UNCONFIRMED', 'AUTH_SESSION_EXPIRED', 'UPSCALE_PROVIDER_FAILED']) {
    const error = Object.assign(new Error('needs attention'), { code });
    const h = harness([error]);
    await assert.rejects(h.run(), error);
    assert.deepEqual(h.actions, ['start']);
    assert.deepEqual(h.waits, []);
  }
});

test('reconnect attempts are bounded after repeated transient failures', async () => {
  const interrupted = Object.assign(new Error('temporary interruption'), { code: 'REQUEST_NETWORK_FAILED' });
  const h = harness([interrupted]);
  await assert.rejects(h.run({ existingOnly: true }), interrupted);
  assert.deepEqual(h.actions, ['status', 'status', 'status', 'status']);
  assert.deepEqual(h.waits, [2500, 5000, 7500]);
});

test('aborting a view stops its polling without submitting or cancelling another provider job', async () => {
  const controller = new AbortController();
  const reason = new Error('view closed');
  const h = harness([{ status: 'queued' }]);
  await assert.rejects(h.run({
    existingOnly: true, signal: controller.signal,
    wait: async () => { controller.abort(reason); },
  }), reason);
  assert.deepEqual(h.actions, ['status']);
});

test('the polling wait itself is cancellable without waiting for the timer', async () => {
  const controller = new AbortController();
  const reason = new Error('navigation');
  const pending = waitForUpscalePoll(60_000, controller.signal);
  controller.abort(reason);
  await assert.rejects(pending, reason);
});

test('the view deadline leaves the saved job available to resume later', async () => {
  const h = harness([{ status: 'queued', elapsedSeconds: 1 }], { maxWaitMs: 6000 });
  await assert.rejects(h.run(), error => error.code === 'UPSCALE_STILL_PROCESSING'
    && /job is saved.*same job for free/.test(error.message));
  assert.deepEqual(h.actions, ['start', 'status']);
  assert.deepEqual(h.waits, [3000, 3000]);
});

test('a success response without a saved URL is rejected rather than forwarding an invalid file', async () => {
  const h = harness([{ status: 'succeeded' }]);
  await assert.rejects(h.run(), /saved upscale URL was not returned/);
  assert.deepEqual(h.actions, ['start']);
});

test('progress messages expose actual stages, queue position, and elapsed time', () => {
  assert.equal(upscaleProgressMessage({ status: 'queued', queuePosition: 0, elapsedSeconds: 0 }), 'Waiting for AI · Queue position 1 · 0s');
  assert.equal(upscaleProgressMessage({ status: 'running', elapsedSeconds: 125 }), 'Upscaling artwork · 2m 5s');
  assert.equal(upscaleProgressMessage({ status: 'saving', elapsedSeconds: 60 }), 'Saving HD file · 1m 0s');
  assert.equal(upscaleProgressMessage({ status: 'ready', elapsedSeconds: -5 }), 'Saving HD file · 0s');
  assert.equal(upscaleProgressMessage({ status: 'submitting' }), 'Connecting to AI · 0s');
});

test('elapsed time keeps moving during a long save without sending extra requests', async () => {
  let clock = 0, tick, finishSave, stopped = 0;
  const progress = [], actions = [];
  const pending = waitForTraceUpscale({
    initialStatus: { status: 'ready', elapsedSeconds: 24 },
    now: () => clock,
    onProgress: state => progress.push(state),
    startInterval: (callback, ms) => { tick = callback; assert.equal(ms, 15000); return 'save-timer'; },
    stopInterval: id => { assert.equal(id, 'save-timer'); stopped++; },
    request: action => { actions.push(action); return new Promise(resolve => { finishSave = resolve; }); },
  });
  clock = 45000;
  tick();
  assert.equal(progress.at(-1).status, 'saving');
  assert.equal(progress.at(-1).message, 'Saving HD file · 1m 9s');
  assert.deepEqual(actions, ['save']);
  finishSave(saved);
  assert.equal((await pending).status, 'succeeded');
  assert.equal(stopped, 1);
});

test('closing the view clears its save progress timer and never cancels the provider job', async () => {
  const controller = new AbortController();
  const reason = new Error('view closed');
  let stopped = 0;
  const actions = [];
  const pending = waitForTraceUpscale({
    initialStatus: { status: 'ready', elapsedSeconds: 24 }, signal: controller.signal,
    startInterval: () => 'timer', stopInterval: () => { stopped++; },
    request: (action, signal) => {
      actions.push(action);
      return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
    },
  });
  controller.abort(reason);
  await assert.rejects(pending, reason);
  assert.equal(stopped, 1);
  assert.deepEqual(actions, ['save']);
});
