import test from 'node:test';
import assert from 'node:assert/strict';
import { readApiResponse } from '../src/lib/apiResponse.mjs';

test('preserves successful payloads and structured API errors', async () => {
  assert.deepEqual(await readApiResponse(Response.json({ projectId: 'project-1' })), { projectId: 'project-1' });
  assert.deepEqual(await readApiResponse(Response.json({ error: 'Unauthorized' }, { status: 401 })), { error: 'Unauthorized' });
});

test('hosting errors do not expose raw text or HTML as parser errors', async () => {
  for (const body of ['Internal Server Error', '<html>private diagnostic</html>', '', 'null']) {
    await assert.rejects(readApiResponse(new Response(body, { status: 500 }), 'Upload temporarily unavailable.'), error => {
      assert.equal(error.message, 'Upload temporarily unavailable.');
      assert.equal(error.status, 500);
      assert.equal(error.code, 'INVALID_API_RESPONSE');
      return true;
    });
  }
});

test('non-JSON oversized upload errors explain how to recover', async () => {
  await assert.rejects(readApiResponse(new Response('Payload Too Large', { status: 413 })), /smaller image/);
});
