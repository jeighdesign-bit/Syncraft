import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/proxy.js', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

test('rate-limit outages return JSON without allowing the protected request through', async () => {
  class NextResponse extends Response {
    static next() { throw new Error('Protected request must not pass during outage'); }
  }
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module,
    require: name => ({
      'next/server': { NextResponse },
      '@/lib/site': { SITE_URL: 'https://syncraftech.com' },
      '@upstash/redis': { Redis: class {} },
      '@upstash/ratelimit': { Ratelimit: class {
        static slidingWindow() { return {}; }
        async limit() { throw new Error('Redis unavailable'); }
      } },
    })[name],
    process: { env: { UPSTASH_REDIS_REST_URL: 'https://test.invalid', UPSTASH_REDIS_REST_TOKEN: 'test' } },
    console: { log() {}, warn() {}, error() {} },
  });
  const response = await module.exports.proxy({
    nextUrl: new URL('https://syncraftech.com/api/upload'),
    headers: new Headers({ host: 'syncraftech.com', 'x-forwarded-for': '192.0.2.1' }),
  });
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('Retry-After'), '30');
  assert.equal((await response.json()).code, 'RATE_LIMIT_SERVICE_UNAVAILABLE');
});
