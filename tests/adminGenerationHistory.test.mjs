import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import * as history from '../src/lib/adminGenerationHistory.mjs';

const retention = 3 * 86_400_000;
const id = '21228676-06ee-4073-99b6-61bdc4bdd372';
const userId = '08bafd26-e228-4a97-9efa-84a930c90098';
const project = () => ({ id, user_id: userId, name: 'Example', trace_type: 'mockup', created_at: new Date(Date.now() - 1000).toISOString(), original_image_url: `https://storage.test/users/${userId}/input.png`, generated_image_url: `https://storage.test/projects/${id}/output.png`, canvas_data: { secret: 'not for list' } });
async function loadRoute(path, extras = {}) {
  const source = (await readFile(new URL(`../src/${path}`, import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '').replace(/\bimport\(/g, '__import(');
  const context = vm.createContext({ ...history, Response, Request, URL, Headers, Buffer, AbortSignal, createHash, Date, process: { env: {} }, console: { error() {}, warn() {} }, PROJECT_RETENTION_MS: retention, __import: async () => ({ default: sharp }), ...extras });
  return vm.runInContext(`${source}\n${path.includes('adminGalleryAuth') ? 'authenticateGalleryRequest' : 'GET'}`, context);
}
function dbMock(rows, { account = null, usage = [] } = {}) {
  const calls = [];
  let accounts = 0;
  const db = { auth: { admin: { getUserById: async () => { accounts++; return { data: { user: account } }; } } }, from(table) {
    const chain = {};
    for (const method of ['select', 'eq', 'gt', 'or', 'order', 'limit']) chain[method] = (...args) => { calls.push([table, method, ...args]); return chain; };
    chain.maybeSingle = async () => ({ data: rows[0] || null });
    chain.then = (resolve, reject) => Promise.resolve({ data: table === 'projects' ? rows : usage }).then(resolve, reject);
    return chain;
  } };
  return { db, calls, get accounts() { return accounts; } };
}
const admin = async () => ({ user: { id: userId } });
const req = query => new Request(`http://localhost:3000/api/admin/generations${query || ''}`);

test('cursor preserves database microseconds and rejects query injection', () => {
  const row = { id, created_at: '2026-11-17T09:00:00.123456+00:00' };
  assert.equal(history.parseHistoryParams(new URLSearchParams({ cursor: history.historyCursor(row) })).cursor.createdAt, row.created_at);
  for (const params of [{ user: 'x,or(id.gt.0)' }, { tool: 'admin' }, { cursor: Buffer.from(JSON.stringify({ id, createdAt: '2026-11-17T00:00:00Z,id.gt.0' })).toString('base64url') }]) assert.throws(() => history.parseHistoryParams(new URLSearchParams(params)));
});

test('preview cache expires data and stays within byte and entry budgets', () => {
  const cache = history.createHistoryPreviewCache({ maxBytes: 8, maxEntries: 2 });
  const value = { body: Buffer.alloc(4) };
  cache.set('a', value, 100, 0); cache.set('b', value, 100, 0);
  cache.get('a', 1); cache.set('c', value, 100, 1);
  assert.equal(cache.get('b', 2), null); assert.equal(cache.bytes, 8); assert.equal(cache.size, 2);
  assert.equal(cache.get('a', 100), null);
  cache.set('large', { body: Buffer.alloc(9) }, 200, 100);
  assert.equal(cache.get('large', 101), null);
});

test('preview work never decodes more than two images concurrently and releases failed jobs', async () => {
  const run = history.createHistoryWorkLimiter(2);
  let active = 0, peak = 0;
  await Promise.allSettled(Array.from({ length: 8 }, (_, index) => run(async () => {
    active++; peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--; if (!index) throw new Error('bad asset');
  })));
  assert.equal(peak, 2); assert.equal(active, 0);
  assert.equal(await run(async () => 1), 1);
});

test('list and media reject unauthorized users before any data or asset reads, including localhost', async () => {
  for (const path of ['app/api/admin/generations/route.js', 'app/api/admin/generations/media/route.js']) {
    for (const status of [401, 403]) {
      const get = await loadRoute(path, { authenticateGalleryRequest: async () => ({ user: null, status, error: 'Denied' }), adminSupabase: { from() { assert.fail('Unauthorized database read'); } }, fetchStoredAsset() { assert.fail('Unauthorized download'); } });
      assert.equal((await get(req(`?id=${id}`))).status, status);
    }
  }
});

test('cookie session is revalidated against strict admin authorization without a localhost bypass', async () => {
  let validated = 0;
  const authorize = await loadRoute('lib/adminGalleryAuth.js', {
    cookies: async () => ({ getAll: () => [], set() {} }),
    createServerClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'untrusted-cookie' } } }) } }),
    authenticateAdminRequest: async (request, options) => { validated++; assert.equal(request.headers.get('authorization'), 'Bearer untrusted-cookie'); assert.equal(options, undefined); return { user: null, status: 403 }; },
  });
  assert.equal((await authorize(req())).status, 403); assert.equal(validated, 1);
});

test('history list is bounded, omits private/raw fields, and makes no account-directory calls', async () => {
  const rows = Array.from({ length: 19 }, (_, i) => ({ ...project(), id: `21228676-06ee-4073-99b6-${String(i).padStart(12, '0')}` }));
  const mock = dbMock(rows);
  const get = await loadRoute('app/api/admin/generations/route.js', { authenticateGalleryRequest: admin, adminSupabase: mock.db });
  const response = await get(req('?tool=mockup'));
  const body = await response.json();
  assert.equal(body.projects.length, 18); assert.ok(body.nextCursor); assert.equal(mock.accounts, 0);
  assert.match(response.headers.get('cache-control'), /private, no-store/);
  assert.equal(body.projects[0].canvas_data, undefined); assert.equal(body.projects[0].generated_image_url, undefined);
  assert.ok(mock.calls.some(c => c[1] === 'limit' && c[2] === 19));
  assert.ok(mock.calls.some(c => c[1] === 'gt' && c[2] === 'created_at' && Math.abs(Date.parse(c[3]) - (Date.now() - retention)) < 2000));
  assert.ok(mock.calls.some(c => c[1] === 'eq' && c[2] === 'trace_type' && c[3] === 'mockup'));
  assert.ok(mock.calls.filter(c => c[1] === 'select').every(c => !c[2].includes('*') && !c[2].includes('canvas_data')));
});

test('cursor pagination applies an exclusive timestamp/id boundary', async () => {
  const row = project(), mock = dbMock([]);
  const get = await loadRoute('app/api/admin/generations/route.js', { authenticateGalleryRequest: admin, adminSupabase: mock.db });
  assert.equal((await get(req(`?cursor=${history.historyCursor(row)}&user=${userId}`))).status, 200);
  assert.ok(mock.calls.some(c => c[1] === 'or' && c[2].includes(`created_at.lt.${row.created_at}`) && c[2].includes(`id.lt.${id}`)));
  assert.ok(mock.calls.some(c => c[1] === 'eq' && c[2] === 'user_id' && c[3] === userId));
});

test('details resolve only the selected account and expose a limited usage receipt', async () => {
  const mock = dbMock([project()], { account: { email: 'owner@example.test' }, usage: [{ provider: 'openai', metadata: { model: 'test-image', secret: 'hidden' }, estimated_cost_usd: 0.04, created_at: new Date().toISOString() }] });
  const get = await loadRoute('app/api/admin/generations/route.js', { authenticateGalleryRequest: admin, adminSupabase: mock.db });
  const body = await (await get(req(`?id=${id}`))).json();
  assert.equal(mock.accounts, 1); assert.equal(body.project.email, 'owner@example.test');
  assert.equal(body.project.activity[0].model, 'test-image'); assert.equal(body.project.activity[0].metadata, undefined);
});

test('expired project details and media are unavailable even before the cleanup cron runs', async () => {
  for (const path of ['app/api/admin/generations/route.js', 'app/api/admin/generations/media/route.js']) {
    const mock = dbMock([{ ...project(), created_at: new Date(Date.now() - retention - 1).toISOString() }]);
    const get = await loadRoute(path, { authenticateGalleryRequest: admin, adminSupabase: mock.db, fetchStoredAsset() { assert.fail('Expired download'); } });
    assert.equal((await get(req(`?id=${id}`))).status, 404); assert.equal(mock.accounts, 0);
  }
});

test('media rejects unowned or non-allowlisted asset URLs without downloading', async () => {
  for (const owned of [false, true]) {
    const get = await loadRoute('app/api/admin/generations/media/route.js', { authenticateGalleryRequest: admin, adminSupabase: dbMock([project()]).db, isOwnedStorageUrl: () => owned, validateUrlForSSRF: async () => false, getAllowedStorageHosts: () => [], fetchStoredAsset() { assert.fail('Untrusted download'); } });
    assert.equal((await get(req(`?id=${id}`))).status, 404);
  }
});

test('thumbnails are small WebP, full results retain native pixels, and preview lifetime cannot exceed project expiry', async () => {
  const image = await sharp({ create: { width: 768, height: 1376, channels: 3, background: '#859a68' } }).png().toBuffer();
  let downloads = 0;
  const get = await loadRoute('app/api/admin/generations/media/route.js', { authenticateGalleryRequest: admin, adminSupabase: dbMock([{ ...project(), created_at: new Date(Date.now() - retention + 120_000).toISOString() }]).db, isOwnedStorageUrl: () => true, validateUrlForSSRF: async () => true, getAllowedStorageHosts: () => ['storage.test'], MAX_NATIVE_4K_BYTES: 50_000_000, fetchStoredAsset: async () => { downloads++; return { buffer: image, response: { ok: true } }; } });
  const thumb = await get(req(`?id=${id}`));
  const metadata = await sharp(Buffer.from(await thumb.arrayBuffer())).metadata();
  assert.equal(metadata.format, 'webp'); assert.equal(metadata.height, 320);
  assert.match(thumb.headers.get('cache-control'), /private/); assert.equal(thumb.headers.get('vary'), 'Cookie, Authorization');
  assert.ok(Number(/max-age=(\d+)/.exec(thumb.headers.get('cache-control'))[1]) <= 120);
  await get(req(`?id=${id}`)); assert.equal(downloads, 1);
  const full = await get(req(`?id=${id}&size=full`));
  assert.deepEqual(Buffer.from(await full.arrayBuffer()), image); assert.match(full.headers.get('cache-control'), /no-store/);
});
