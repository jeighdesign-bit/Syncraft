import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import * as community from '../src/lib/community.mjs';

const owner = { id: randomUUID() }, other = { id: randomUUID() }, admin = { id: randomUUID() };
const users = { owner, other, admin };
const logo = await sharp({ create: { width: 80, height: 40, channels: 4, background: '#247546' } }).extend({ top: 4, bottom: 4, left: 4, right: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();

async function harness({ storageFailure = false, dbFailure = false } = {}) {
  const rows = [], files = new Map(), calls = [];
  const database = {
    storage: { from(bucket) {
      assert.equal(bucket, community.COMMUNITY_BUCKET);
      return {
        async upload(path, bytes, options) { calls.push('upload'); if (storageFailure) return { error: { message: 'private provider details' } }; files.set(path, Buffer.from(bytes)); return { data: { path } }; },
        async remove(paths) { for (const path of paths) files.delete(path); return { error: null }; },
        async download(path) { calls.push('download'); return files.has(path) ? { data: new Blob([files.get(path)]) } : { error: { message: 'missing' } }; },
      };
    } },
    from(table) {
      assert.equal(table, 'community_submissions');
      let fields, operation, values, filters = [], single = false;
      const query = {
        select(value) { fields = value; return query; },
        eq(key, value) { filters.push(row => row[key] === value); return query; },
        neq(key, value) { filters.push(row => row[key] !== value); return query; },
        order() { return query; }, limit() { return query; },
        maybeSingle() { single = true; return query; }, single() { single = true; return query; },
        upsert(value) { operation = 'upsert'; values = value; return query; },
        update(value) { operation = 'update'; values = value; return query; },
        then(resolve, reject) {
          calls.push(operation || 'select');
          if (dbFailure) return Promise.resolve({ data: null, error: { code: '42P01' } }).then(resolve, reject);
          let matched = rows.filter(row => filters.every(filter => filter(row)));
          if (operation === 'upsert') {
            let row = rows.find(row => row.user_id === values.user_id);
            if (!row) { row = { id: randomUUID(), created_at: new Date().toISOString() }; rows.push(row); }
            Object.assign(row, values); matched = [row];
          } else if (operation === 'update') matched.forEach(row => Object.assign(row, values));
          const projected = matched.map(row => Object.fromEntries(fields.split(',').map(key => [key, row[key]])));
          return Promise.resolve({ data: single ? projected[0] || null : projected, error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const who = request => users[request.headers.get('authorization')?.replace('Bearer ', '')] || null;
  const deps = { ...community, URL, Request, Response, Buffer, sharp, randomUUID, console,
    NextResponse: { json: (body, init) => Response.json(body, init) }, adminSupabase: database,
    authenticateRequest: async request => ({ user: who(request) }),
    authenticateAdminRequest: async request => ({ user: who(request) === admin ? admin : null, error: 'Admin access required.', status: who(request) ? 403 : 401 }),
    enforceRateLimit: async () => ({ success: true }),
  };
  const handlers = {};
  for (const [name, file, exports] of [
    ['user', '../src/app/api/community/route.js', '{GET,POST,DELETE}'],
    ['review', '../src/app/api/admin/community/route.js', '{GET,PATCH}'],
    ['image', '../src/app/api/community/logo/route.js', '{GET}'],
  ]) {
    const source = (await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '');
    handlers[name] = vm.runInNewContext(`${source}\n(${exports})`, { ...deps });
  }
  function request(method = 'GET', actor, body, url = '/api/community') {
    const headers = new Headers();
    if (actor) headers.set('Authorization', `Bearer ${actor}`);
    if (body && !(body instanceof FormData)) { headers.set('Content-Type', 'application/json'); body = JSON.stringify(body); }
    return new Request(`http://localhost${url}`, { method, headers, ...(body ? { body } : {}) });
  }
  function form(extra = {}) {
    const body = new FormData();
    body.set('businessName', 'Sample Print Shop'); body.set('website', 'https://example.com/shop'); body.set('consent', 'true');
    body.set('logo', new Blob([logo], { type: 'image/png' }), 'logo.png');
    for (const [key, value] of Object.entries(extra)) body.set(key, value);
    return body;
  }
  return { ...handlers, rows, files, calls, request, form };
}

test('community validates names, explicit consent and safe business links', () => {
  assert.equal(community.validateCommunityDetails({ businessName: ' Shop ', website: 'facebook.com/shop', consent: true }).website, 'https://facebook.com/shop');
  for (const website of ['javascript:alert(1)', 'data:text/html,hello', 'https://name:secret@example.com', 'ftp://example.com', 'http://localhost']) {
    assert.throws(() => community.validateCommunityDetails({ businessName: 'Shop', website, consent: true }));
  }
  assert.throws(() => community.validateCommunityDetails({ businessName: 'Shop', website: 'example.com', consent: 'true' }));
});

test('anonymous requests cannot submit, read personal submissions, withdraw or review', async () => {
  const h = await harness();
  assert.equal((await h.user.POST(h.request('POST', null, h.form()))).status, 401);
  assert.equal((await h.user.GET(h.request('GET', null, null, '/api/community?mine=1'))).status, 401);
  assert.equal((await h.user.DELETE(h.request('DELETE', null, {}))).status, 401);
  assert.equal((await h.review.GET(h.request())).status, 401);
  assert.equal((await h.review.PATCH(h.request('PATCH', 'owner', {}))).status, 403);
  assert.deepEqual(h.calls, []);
});

test('pending logos remain private; approval publishes only safe public fields and image', async () => {
  const h = await harness();
  const submitted = await h.user.POST(h.request('POST', 'owner', h.form({ status: 'approved', user_id: other.id })));
  assert.equal(submitted.status, 201);
  const { submission } = await submitted.json();
  assert.equal(submission.status, 'pending');
  assert.equal(h.rows[0].user_id, owner.id);
  assert.deepEqual((await (await h.user.GET(h.request())).json()).businesses, []);
  const imageUrl = `/api/community/logo?id=${submission.id}`;
  assert.equal((await h.image.GET(h.request('GET', null, null, imageUrl))).status, 404);
  assert.equal((await h.image.GET(h.request('GET', 'other', null, imageUrl))).status, 404);
  assert.equal((await h.image.GET(h.request('GET', 'owner', null, imageUrl))).status, 200);
  assert.equal((await h.image.GET(h.request('GET', 'admin', null, imageUrl))).status, 200);
  const imageMeta = await sharp(h.files.get(h.rows[0].logo_path)).metadata();
  assert.equal(imageMeta.format, 'webp');
  assert.equal(imageMeta.hasAlpha, true);
  const alphaStats = (await sharp(h.files.get(h.rows[0].logo_path)).stats()).channels.at(-1);
  assert.equal(alphaStats.min, 0);
  assert.ok(alphaStats.max > 0);
  const approved = await h.review.PATCH(h.request('PATCH', 'admin', { id: submission.id, revision: submission.revision, status: 'approved' }));
  assert.equal(approved.status, 200);
  const publicResponse = await h.user.GET(h.request());
  assert.equal(publicResponse.headers.get('Cache-Control'), 'no-store');
  const { businesses } = await publicResponse.json();
  assert.equal(businesses.length, 1);
  assert.deepEqual(Object.keys(businesses[0]).sort(), ['business_name','id','logo_url','website']);
  const publicImage = await h.image.GET(h.request('GET', null, null, imageUrl));
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get('Content-Type'), 'image/webp');
  assert.match(publicImage.headers.get('Cache-Control'), /no-store/);
});

test('resubmission hides a listing, keeps one row and prevents approving an outdated revision', async () => {
  const h = await harness();
  const first = (await (await h.user.POST(h.request('POST', 'owner', h.form()))).json()).submission;
  const approved = (await (await h.review.PATCH(h.request('PATCH', 'admin', { ...first, status: 'approved' }))).json()).submission;
  const oldPath = h.rows[0].logo_path;
  const next = (await (await h.user.POST(h.request('POST', 'owner', h.form({ businessName: 'Updated Print Shop' })))).json()).submission;
  assert.equal(h.rows.length, 1); assert.equal(next.status, 'pending'); assert.equal(next.id, first.id);
  assert.equal(h.files.has(oldPath), false);
  assert.equal((await h.review.PATCH(h.request('PATCH', 'admin', { ...approved, status: 'approved' }))).status, 409);
  assert.deepEqual((await (await h.user.GET(h.request())).json()).businesses, []);
});

test('requesting changes needs a note, removes publication, and withdrawal cannot be republished', async () => {
  const h = await harness();
  let row = (await (await h.user.POST(h.request('POST', 'owner', h.form()))).json()).submission;
  row = (await (await h.review.PATCH(h.request('PATCH', 'admin', { ...row, status: 'approved' }))).json()).submission;
  assert.equal((await h.review.PATCH(h.request('PATCH', 'admin', { ...row, status: 'changes_requested' }))).status, 400);
  row = (await (await h.review.PATCH(h.request('PATCH', 'admin', { ...row, status: 'changes_requested', note: 'Please provide a clearer logo.' }))).json()).submission;
  assert.deepEqual((await (await h.user.GET(h.request())).json()).businesses, []);
  assert.equal((await h.user.DELETE(h.request('DELETE', 'other', { revision: row.revision }))).status, 409);
  const withdrawn = await h.user.DELETE(h.request('DELETE', 'owner', { revision: row.revision }));
  assert.equal(withdrawn.status, 200);
  row = (await withdrawn.json()).submission;
  assert.equal(row.status, 'withdrawn');
  assert.equal((await h.review.PATCH(h.request('PATCH', 'admin', { ...row, status: 'approved' }))).status, 409);
});

test('invalid logos and missing consent never reach storage or database writes', async () => {
  const h = await harness();
  assert.equal((await h.user.POST(h.request('POST', 'owner', h.form({ consent: 'false' })))).status, 400);
  assert.equal((await h.user.POST(h.request('POST', 'owner', h.form({ logo: new Blob(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], { type: 'image/png' }) })))).status, 400);
  assert.equal((await h.user.POST(h.request('POST', 'owner', h.form({ logo: new Blob(['corrupt']) })))).status, 400);
  assert.equal(h.files.size, 0); assert.equal(h.rows.length, 0); assert.deepEqual(h.calls, []);
});

test('the actual request stream is bounded even without Content-Length', async () => {
  const request = new Request('http://localhost/api/community', { method: 'POST', body: 'x'.repeat(32) });
  await assert.rejects(community.boundedCommunityRequest(request, 16), /REQUEST_TOO_LARGE/);
});

test('only real, visible transparent PNGs are accepted, including when a file is renamed', async () => {
  const h = await harness();
  const opaque = sharp({ create: { width: 20, height: 20, channels: 4, background: '#ffffff' } });
  const cases = [await opaque.clone().png().toBuffer(), await opaque.clone().removeAlpha().png().toBuffer(), await opaque.clone().jpeg().toBuffer(), await sharp(logo).webp().toBuffer(), await sharp({ create: { width: 20, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer()];
  for (const bytes of cases) {
    const response = await h.user.POST(h.request('POST', 'owner', h.form({ logo: new Blob([bytes], { type: 'image/png' }) })));
    assert.equal(response.status, 400);
  }
  assert.equal(h.files.size, 0); assert.equal(h.rows.length, 0);
});

test('storage or database outages cannot create a published listing or leak provider details', async () => {
  for (const options of [{ storageFailure: true }, { dbFailure: true }]) {
    const h = await harness(options);
    const response = await h.user.POST(h.request('POST', 'owner', h.form()));
    assert.equal(response.status, 503); assert.equal(h.rows.length, 0);
    assert.doesNotMatch(await response.text(), /private provider/);
  }
});
