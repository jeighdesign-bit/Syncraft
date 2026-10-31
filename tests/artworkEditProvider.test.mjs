import test from 'node:test';
import assert from 'node:assert/strict';
import {
  artworkEditProviderRequest,
  artworkEditFailureDetails,
} from '../src/lib/artworkEditProvider.mjs';

test('a queue receipt returns its request ID with exactly one submission', async () => {
  let calls = 0;
  const result = await artworkEditProviderRequest(
    'fal-ai/nano-banana-pro/edit',
    { image_urls: ['https://v3.fal.media/source.png'] },
    {
      apiKey: 'test-key',
      fetchImpl: async (_url, options) => {
        calls++;
        assert.equal(options.method, 'POST');
        assert.equal(options.cache, 'no-store');
        return Response.json({ request_id: 'saved-provider-id' });
      },
    },
  );
  assert.equal(result.request_id, 'saved-provider-id');
  assert.equal(calls, 1);
});

test('explicit body-size or endpoint rejections can be refunded; 5xx failures remain unconfirmed', async () => {
  for (const status of [404, 405, 413, 415, 422, 429, 500, 502, 504]) {
    let calls = 0;
    await assert.rejects(
      artworkEditProviderRequest(
        'model/edit',
        { prompt: 'Edit' },
        {
          apiKey: 'test-key',
          fetchImpl: async () => {
            calls++;
            return new Response('Rejected', { status });
          },
        },
      ),
      (error) => {
        assert.equal(error.providerStatus, status);
        assert.equal(error.definiteRejection, status < 500);
        assert.ok(error.elapsedMs >= 0);
        return true;
      },
    );
    assert.equal(calls, 1);
  }
});

test('interrupted submissions retain diagnostic codes without leaking input or replaying the POST', async () => {
  let calls = 0;
  await assert.rejects(
    artworkEditProviderRequest(
      'model/edit',
      { image_urls: ['private-image'] },
      {
        apiKey: 'secret-key',
        fetchImpl: async () => {
          calls++;
          throw new TypeError('network payload private-image', {
            cause: { code: 'UND_ERR_SOCKET' },
          });
        },
      },
    ),
    (error) => {
      const diagnostic = artworkEditFailureDetails(error, 'submit-provider');
      assert.equal(diagnostic.causeCode, 'UND_ERR_SOCKET');
      assert.equal(error.definiteRejection, undefined);
      assert.doesNotMatch(JSON.stringify(diagnostic), /private-image|secret-key/);
      return true;
    },
  );
  assert.equal(calls, 1);
});
