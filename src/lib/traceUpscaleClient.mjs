export function upscaleProgressMessage(state) {
  const seconds = Math.max(0, Number(state.elapsedSeconds) || 0);
  const elapsed = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
  const label =
    {
      submitting: 'Connecting to AI',
      queued: 'Waiting for AI',
      running: 'Upscaling artwork',
      ready: 'Saving HD file',
      saving: 'Saving HD file',
      succeeded: 'HD file saved',
    }[state.status] || 'Checking upscale';
  const position =
    state.status === 'queued' && Number.isFinite(state.queuePosition)
      ? ` · Queue position ${state.queuePosition + 1}`
      : '';
  return `${label}${position} · ${elapsed}`;
}

export function waitForUpscalePoll(ms, signal) {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  });
}

// Polling stops when this view closes; the saved provider job keeps running.
// Every retry uses the same server-side reservation, including a lost start response.
export async function waitForTraceUpscale({
  request,
  signal,
  onProgress = () => {},
  existingOnly = false,
  initialStatus,
  wait = waitForUpscalePoll,
  now = Date.now,
  maxWaitMs = 10 * 60_000,
  startInterval = setInterval,
  stopInterval = clearInterval,
}) {
  const started = now();
  let action = existingOnly ? 'status' : 'start';
  let state = initialStatus;
  let failures = 0;
  let lastMessage = '';
  let lastProgressState = initialStatus;
  let lastProgressAt = started;

  const requestState = async () => {
    if (action !== 'save') return request(action, signal);
    // Saving is one long HTTP call. Keep elapsed time moving without polling,
    // repeating uploads, or implying that the AI is still running.
    const timer = startInterval(() => {
      if (signal?.aborted) return;
      const progress = {
        ...lastProgressState,
        status: 'saving',
        elapsedSeconds:
          Math.max(0, Number(lastProgressState?.elapsedSeconds) || 0) +
          Math.floor((now() - lastProgressAt) / 1000),
      };
      onProgress({ ...progress, message: upscaleProgressMessage(progress) });
    }, 15_000);
    try {
      return await request(action, signal);
    } finally {
      stopInterval(timer);
    }
  };
  while (now() - started < maxWaitMs) {
    signal?.throwIfAborted();
    try {
      state = state || (await requestState());
      failures = 0;
    } catch (error) {
      signal?.throwIfAborted();
      const reconnectable =
        [
          'REQUEST_TIMEOUT',
          'REQUEST_NETWORK_FAILED',
          'UPSCALE_STATUS_UNAVAILABLE',
          'UPSCALE_STORAGE_UNAVAILABLE',
          'UPSCALE_SAVE_INTERRUPTED',
        ].includes(error.code) || error.status === 429;
      if (!reconnectable || ++failures > 3) throw error;
      onProgress({ status: 'submitting', message: 'Reconnecting to your saved upscale job…' });
      await wait(Math.min(10_000, failures * 2500), signal);
      continue;
    }
    if (state.status === 'none') {
      if (existingOnly) return null;
      throw new Error('No upscale job was found. Resume HD Upscale for free.');
    }
    if (state.status === 'succeeded') {
      if (!state.fileUrl)
        throw new Error('The saved upscale URL was not returned. Reopen the project to resume.');
      return state;
    }
    lastProgressState = state;
    lastProgressAt = now();
    const message = upscaleProgressMessage(state);
    if (message !== lastMessage) {
      onProgress({ ...state, message });
      lastMessage = message;
    }
    action = ['ready', 'saving'].includes(state.status) ? 'save' : 'status';
    const previousStatus = state.status;
    state = null;
    if (previousStatus !== 'ready') await wait(previousStatus === 'saving' ? 12_000 : 3000, signal);
  }
  throw Object.assign(
    new Error(
      'HD Upscale is still processing. Your job is saved. Reopen this project to resume the same job for free.',
    ),
    { code: 'UPSCALE_STILL_PROCESSING' },
  );
}
