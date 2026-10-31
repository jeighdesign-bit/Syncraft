import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { fetchWithSSRFProtection } from '../src/lib/ssrf.js';

async function serverTest(run, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/asset`;
  try { await run(url); } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
const options = { allowedHosts: ['127.0.0.1'], timeoutMs: 1000, retryDelayMs: 1, allowedContentTypes: ['image/'] };

test('a body that stalls after successful headers is still timed out', async () => {
  await serverTest(async url => {
    await assert.rejects(fetchWithSSRFProtection(url, { ...options, timeoutMs: 100 }), { name: 'TimeoutError' });
  }, (_req, res) => { res.writeHead(200, { 'content-type': 'image/png' }); res.write('partial'); });
});

test('an interrupted body is retried from scratch, without retaining partial bytes', async () => {
  let calls = 0;
  await serverTest(async url => {
    const result = await fetchWithSSRFProtection(url, { ...options, maxAttempts: 2 });
    assert.equal(result.buffer.toString(), 'complete');
    assert.equal(calls, 2);
  }, (_req, res) => {
    calls++;
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': calls === 1 ? 100 : 8 });
    res.write(calls === 1 ? 'partial' : 'complete');
    if (calls === 1) setTimeout(() => res.destroy(), 10); else res.end();
  });
});

test('rate-limited GETs retry before content-type validation', async () => {
  let calls = 0;
  await serverTest(async url => {
    const result = await fetchWithSSRFProtection(url, { ...options, maxAttempts: 2 });
    assert.equal(result.buffer.toString(), 'ready');
    assert.equal(calls, 2);
  }, (_req, res) => {
    calls++;
    res.writeHead(calls === 1 ? 429 : 200, { 'content-type': calls === 1 ? 'text/html' : 'image/png' });
    res.end(calls === 1 ? 'busy' : 'ready');
  });
});

test('a caller deadline cancels a stalled body and prevents retries', async () => {
  let calls = 0;
  await serverTest(async url => {
    await assert.rejects(fetchWithSSRFProtection(url, { ...options, maxAttempts: 3, signal: AbortSignal.timeout(100) }), { name: 'TimeoutError' });
    assert.equal(calls, 1);
  }, (_req, res) => { calls++; res.writeHead(200, { 'content-type': 'image/png' }); res.write('partial'); });
});

test('provider POSTs are not replayed on a temporary error', async () => {
  let calls = 0;
  await serverTest(async url => {
    await assert.rejects(fetchWithSSRFProtection(url, { ...options, maxAttempts: 3, fetchOptions: { method: 'POST', body: 'paid job' } }), { status: 503 });
    assert.equal(calls, 1);
  }, (_req, res) => { calls++; res.writeHead(503); res.end('busy'); });
});

test('size and MIME failures are rejected without retries', async () => {
  for (const mode of ['size', 'mime']) {
    let calls = 0;
    await serverTest(async url => {
      await assert.rejects(fetchWithSSRFProtection(url, { ...options, maxBytes: 4, maxAttempts: 3 }), /too large|invalid content type/);
      assert.equal(calls, 1);
    }, (_req, res) => {
      calls++;
      res.writeHead(200, { 'content-type': mode === 'size' ? 'image/png' : 'text/html' });
      res.end(mode === 'size' ? '123456789' : 'bad');
    });
  }
});

test('redirect destinations are checked against the allowlist', async () => {
  let calls = 0;
  await serverTest(async url => {
    await assert.rejects(fetchWithSSRFProtection(url, { ...options, maxAttempts: 3 }), /unauthorized URL/);
    assert.equal(calls, 1);
  }, (_req, res) => { calls++; res.writeHead(302, { location: 'http://localhost/private' }); res.end(); });
});

test('permanent HTTP failures preserve their status and do not retry', async () => {
  let calls = 0;
  await serverTest(async url => {
    await assert.rejects(fetchWithSSRFProtection(url, { ...options, maxAttempts: 3 }), { status: 403 });
    assert.equal(calls, 1);
  }, (_req, res) => { calls++; res.writeHead(403, { 'content-type': 'application/xml' }); res.end('<error>Denied</error>'); });
});
