const CHUNK_BYTES = 8 * 1024 * 1024;
const PROBE_BYTES = 64 * 1024;
const MAX_CONCURRENT_READS = 3;

// Provider outputs are immutable per job. Keep completed chunks while retrying
// interrupted reads, and copy the exact bytes without decoding/re-encoding.
export async function downloadUpscaleFile(url, { fetchAsset, allowedHosts, maxBytes, signal }) {
  signal?.throwIfAborted();
  const read = (start, end, validator, limit = maxBytes, readSignal = signal) =>
    fetchAsset(url, {
      allowedHosts,
      maxBytes: limit,
      allowedContentTypes: ['image/', 'application/octet-stream'],
      timeoutMs: 60_000,
      maxAttempts: 2,
      signal: readSignal,
      fetchOptions: {
        headers: {
          Range: `bytes=${start}-${end}`,
          'Accept-Encoding': 'identity',
          ...(validator ? { 'If-Range': validator } : {}),
        },
      },
    });
  // Discover size/range support with a small read, then start parallel parts.
  // Waiting for a full 4 MiB first chunk left the other connections idle.
  const first = await read(0, PROBE_BYTES - 1);
  // Some storage hosts ignore Range. The bounded full-file read is still valid.
  if (first.response.status === 200) return first;
  const range = first.response.headers.get('content-range')?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
  const total = Number(range?.[3]);
  if (
    first.response.status !== 206 ||
    !range ||
    Number(range[1]) !== 0 ||
    !Number.isSafeInteger(total) ||
    total < 1 ||
    total > maxBytes ||
    Number(range[2]) !== Math.min(PROBE_BYTES, total) - 1 ||
    first.buffer.length !== Number(range[2]) + 1
  ) {
    throw new Error('Invalid HD download range');
  }
  const etag = first.response.headers.get('etag');
  const validator =
    etag && !etag.startsWith('W/') ? etag : first.response.headers.get('last-modified');
  const buffer = Buffer.allocUnsafe(total);
  first.buffer.copy(buffer, 0);
  let next = first.buffer.length;
  const controller = new AbortController();
  const combinedSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  // Bound concurrency while allowing large outputs to use more of the link.
  const worker = async () => {
    while (next < total) {
      combinedSignal.throwIfAborted();
      const start = next;
      const end = Math.min(start + CHUNK_BYTES, total) - 1;
      next = end + 1;
      const part = await read(start, end, validator, end - start + 1, combinedSignal);
      const expected = `bytes ${start}-${end}/${total}`;
      if (
        part.response.status !== 206 ||
        part.response.headers.get('content-range') !== expected ||
        part.buffer.length !== end - start + 1 ||
        (etag && part.response.headers.get('etag') !== etag)
      ) {
        throw new Error('HD download changed or returned an incomplete range');
      }
      part.buffer.copy(buffer, start);
    }
  };
  const workerCount = Math.min(MAX_CONCURRENT_READS, Math.ceil((total - next) / CHUNK_BYTES));
  const workers = Array.from({ length: workerCount }, () =>
    worker().catch((error) => {
      controller.abort(error);
      throw error;
    }),
  );
  const results = await Promise.allSettled(workers);
  const failed = results.find((result) => result.status === 'rejected');
  if (failed) throw failed.reason;
  signal?.throwIfAborted();
  return { ...first, buffer };
}
