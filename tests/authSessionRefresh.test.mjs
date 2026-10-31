import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/utils/supabase/proxy.js', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;

function harness({ path = '/workspace', cookies = [{ name: 'sb-project-auth-token.0', value: 'expired' }], refresh = true } = {}) {
  const requestCookies = new Map(cookies.map(cookie => [cookie.name, cookie.value]));
  const writes = [], calls = [];
  const request = {
    nextUrl: new URL(`https://syncraft.test${path}`),
    cookies: { getAll: () => [...requestCookies].map(([name, value]) => ({ name, value })), set: (name, value) => requestCookies.set(name, value) },
  };
  class NextResponse extends Response {
    static next({ request }) {
      const result = new NextResponse();
      result.forwarded = request.cookies.getAll();
      result.cookies = { set: (name, value, options) => writes.push({ result, name, value, options }) };
      return result;
    }
  }
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module, process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://auth.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key' } },
    require: name => ({
      'next/server': { NextResponse },
      '@/lib/supabaseFetch.mjs': { supabaseFetch: () => {} },
      '@supabase/ssr': { createServerClient: (_url, _key, options) => ({ auth: { getUser: async () => {
        calls.push('verify');
        if (refresh) options.cookies.setAll([{ name: 'sb-project-auth-token.0', value: 'refreshed', options: { httpOnly: false, sameSite: 'lax', path: '/' } }]);
        return { data: { user: refresh ? { id: 'verified-user' } : null }, error: null };
      } } }) },
    })[name],
  });
  return { run: () => module.exports.updateSession(request), requestCookies, writes, calls };
}

test('rotated session cookies reach both the server page and the browser in the returned response', async () => {
  const h = harness();
  const response = await h.run();
  assert.equal(h.requestCookies.get('sb-project-auth-token.0'), 'refreshed');
  assert.equal(response.forwarded[0].value, 'refreshed');
  assert.equal(h.writes.length, 1);
  assert.equal(h.writes[0].result, response);
  assert.equal(h.writes[0].options.sameSite, 'lax');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(h.calls, ['verify']);
});

test('public guests, API bearer requests, assets, and OAuth callbacks do not trigger cookie refresh', async () => {
  for (const config of [{ cookies: [] }, { path: '/api/trace-upscale' }, { path: '/api/auth/callback' }, { path: '/logo.svg' }]) {
    const h = harness(config);
    await h.run();
    assert.equal(h.calls.length, 0);
    assert.equal(h.writes.length, 0);
  }
});

test('a rejected session does not create an authenticated user or fabricate refreshed cookies', async () => {
  const h = harness({ refresh: false });
  await h.run();
  assert.deepEqual(h.calls, ['verify']);
  assert.equal(h.writes.length, 0);
  assert.equal(h.requestCookies.get('sb-project-auth-token.0'), 'expired');
});
