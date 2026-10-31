import test from 'node:test';
import assert from 'node:assert/strict';
import { unstable_getResponseFromNextConfig } from 'next/experimental/testing/server.js';
import nextConfig from '../next.config.mjs';

test('public artwork proxy keeps its own cache policy and API framing protection', async () => {
  const response = await unstable_getResponseFromNextConfig({
    url: 'https://syncraft.test/api/proxy?url=https%3A%2F%2Fstorage.test%2Fart.png&preview=1', nextConfig,
  });
  assert.equal(response.headers.get('cache-control'), null);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('project, payment, auth and similarly named APIs still forbid caching', async () => {
  for (const path of ['/api/project', '/api/trace-upscale', '/api/payments/paymongo/status', '/api/auth/callback', '/api/proxy-private', '/api/projects/id/review?url=/api/proxy']) {
    const response = await unstable_getResponseFromNextConfig({ url: `https://syncraft.test${path}`, nextConfig });
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('x-frame-options'), 'DENY');
  }
});
