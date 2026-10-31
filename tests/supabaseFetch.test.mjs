import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { supabaseFetch } from '../src/lib/supabaseFetch.mjs';

test('Supabase transport uses HTTP/1.1 and sends mutation bytes exactly once', async () => {
  const calls = [];
  const server = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    calls.push({ version: request.httpVersion, method: request.method, body: Buffer.concat(chunks).toString() });
    response.writeHead(503, { 'content-type': 'application/json' });
    response.end('{"error":"temporary outage"}');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const response = await supabaseFetch(`http://127.0.0.1:${server.address().port}/auth`, { method: 'POST', body: '{"refresh":"test"}' });
    assert.equal(response.status, 503);
    await response.text();
    assert.deepEqual(calls, [{ version: '1.1', method: 'POST', body: '{"refresh":"test"}' }]);
    await assert.rejects(supabaseFetch(`http://127.0.0.1:${server.address().port}/auth`, { signal: AbortSignal.abort(new Error('deadline')) }), /deadline/);
    assert.equal(calls.length, 1);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
