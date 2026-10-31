import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('upscale progress polls do not inherit the low generation IP limit', async () => {
  const source = (await readFile(new URL('../src/proxy.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
  class NextResponse extends Response {
    static next() { return new NextResponse(null, { status: 200 }); }
    static json(data, init) { return new NextResponse(JSON.stringify(data), init); }
  }
  const context = vm.createContext({ Response, NextResponse, Map, Date, console: { warn() {}, log() {}, error() {} }, process: { env: {} } });
  const { proxy, getRoutePrefix } = vm.runInContext(`${source}\n({proxy, getRoutePrefix})`, context);
  assert.equal(getRoutePrefix('/api/trace-upscale'), '/api/trace-upscale');
  assert.equal(getRoutePrefix('/api/trace-step3'), '/api/trace-step3');
  const request = path => ({ nextUrl: { pathname: path, search: '' }, headers: new Headers({ host: 'syncraftech.com', 'x-forwarded-for': '203.0.113.10' }) });
  for (let i = 0; i < 30; i++) assert.equal((await proxy(request('/api/trace-upscale'))).status, 200);
  for (let i = 0; i < 10; i++) assert.equal((await proxy(request('/api/trace'))).status, 200);
  assert.equal((await proxy(request('/api/trace'))).status, 429);
});
