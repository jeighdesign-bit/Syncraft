import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { LOGO_STYLES, LOGO_COST, LOGO_ACTIVE, logoOperationCost, logoGenerationQuota, validateLogoOperation, buildLogoPrompt, publicLogoProject, logoJobTimedOut, logoStudioAssetUrls } from '../src/lib/logoStudio.mjs';
import { nanoLogoPlan } from '../src/lib/logoFal.mjs';
import { compileLogoDirection, LOGO_COMPILER_VERSION } from '../src/lib/logoPromptCompiler.mjs';
import { planLogoDirections } from '../src/lib/logoArtDirectorServer.js';
import { signLogoState, verifyLogoState } from '../src/lib/logoStudioIntegrity.mjs';
import { LOGO_EXPORT_FORMATS, resolveLogoExportJob } from '../src/lib/logoStudioExport.mjs';

const id = () => crypto.randomUUID();
const input = (changes = {}) => validateLogoOperation({ requestId: id(), prompt: 'A mountain coffee logo', brand: 'Peak', editArea: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, ...changes });

test('reference generation accepts no brief and sends the selected style to the provider', async () => {
  for (const mode of ['image', 'sketch']) {
    for (const style of LOGO_STYLES) {
      const request = input({ mode, style: style.id, prompt: '   ', sourceUrl: 'https://storage.test/eagle.png' });
      const h = await serviceHarness();
      await h.service.startLogoOperation('owner', h.snapshot(), request);
      const plan = nanoLogoPlan(request, request.sourceUrl);
      assert.ok(plan.input.prompt.includes(style.name));
      assert.match(plan.input.prompt, /Peak/);
      assert.doesNotMatch(plan.input.prompt, /User preferences: \s*\./);
      assert.equal(h.submissions.length, 1);
    }
    assert.throws(() => input({ mode, prompt: '' }), /source image first/);
  }
  assert.throws(() => input({ prompt: '' }), /Describe/);
  assert.throws(() => input({ operation: 'edit', prompt: '', sourceId: id() }), /Describe/);
});

test('reference controls reach fal and persist in saved public jobs without extra charges', async () => {
  for (const mode of ['image', 'sketch']) {
    const h = await serviceHarness();
    const request = input({ mode, ...(mode === 'sketch' ? { sketchMode: 'precise' } : {}), style: 'mascot', prompt: '', sourceUrl: 'https://storage.test/source.png',
      designSettings: { detail: 'minimal', primaryColor: '#193b53', backgroundColor: '#fff4db' } });
    await h.service.startLogoOperation('owner', h.snapshot(), request);
    const submission = h.submissions[0];
    assert.equal(submission.endpoint, 'fal-ai/nano-banana-2/edit');
    assert.deepEqual(submission.request.input.image_urls, [request.sourceUrl]);
    assert.match(submission.request.input.prompt, /Authoritative primary color: #193B53/);
    assert.match(submission.request.input.prompt, /#FFF4DB/);
    if (mode === 'sketch') assert.match(submission.request.input.prompt, /Sketch fidelity/);
    await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
    const saved = publicLogoProject(h.snapshot()).jobs[0];
    assert.equal(saved.status, 'succeeded');
    assert.deepEqual(saved.designSettings, request.designSettings);
    if (mode === 'sketch') assert.equal(saved.sketchMode, 'precise');
    assert.equal(h.charges.size, 1);
    assert.equal([...h.charges.values()][0].amount, 8);
  }
});

test('short preferences do not need to repeat the selected mascot style', () => {
  for (const mode of ['text', 'image', 'sketch']) {
    const request = input({ mode, style: 'mascot', prompt: 'Navy and orange, fierce expression', sourceUrl: 'https://storage.test/eagle.png' });
    const plan = nanoLogoPlan(request, request.sourceUrl);
    assert.match(plan.input.prompt, /Mascot/);
    assert.match(plan.input.prompt, /Navy and orange, fierce expression/);
    assert.match(plan.input.prompt, /Peak/);
  }
});

test('image generation reserves a centered artboard without changing sketch or text prompts', () => {
  const image = buildLogoPrompt(input({ mode: 'image', style: 'line', sourceUrl: 'https://storage.test/portrait.png' }));
  assert.match(image, /middle 76% of the square canvas/);
  assert.match(image, /Nothing may touch or be cut off by the canvas edge/);
  for (const mode of ['text', 'sketch']) {
    const prompt = buildLogoPrompt(input({ mode, sourceUrl: mode === 'sketch' ? 'https://storage.test/sketch.png' : undefined }));
    assert.doesNotMatch(prompt, /middle 76% of the square canvas/);
  }
});

test('Wordmark requires brand text before billing and makes lettering dominant in every mode', () => {
  for (const mode of ['text', 'image', 'sketch']) {
    for (const operation of ['generate', 'variations']) {
      assert.throws(() => input({ mode, operation, style: 'wordmark', brand: '   ', sourceUrl: 'https://storage.test/reference.png' }), /exact brand name/);
      const request = input({ mode, operation, style: 'wordmark', brand: 'Barber', prompt: 'Cracked piggy bank, coins spilling, halftone print, skate brand.', sourceUrl: 'https://storage.test/reference.png' });
      const plan = nanoLogoPlan(request, request.sourceUrl);
      assert.match(plan.input.prompt, /complete brand name clearly readable/);
      assert.match(plan.input.prompt, /exact brand name is "Barber"/);
      assert.match(plan.input.prompt, /must never replace the wordmark/);
      assert.doesNotMatch(plan.input.prompt, /[Ss]ymbol only|do not add letters|subject must remain larger|MAIN SUBJECT/);
    }
  }
  assert.doesNotThrow(() => input({ style: 'wordmark', brand: 'Barber', prompt: '' }));
  assert.doesNotThrow(() => input({ style: 'mascot', brand: '' }));
  const edit = input({ operation: 'edit', style: 'wordmark', brand: '', sourceId: id(), prompt: 'Make the text red' });
  assert.match(buildLogoPrompt(edit), /Apply only this instruction/);
});

test('approved prices are charged by the server for each mode and operation', async () => {
  for (const [operation, mode, expected] of [
    ['generate', 'text', 8], ['generate', 'image', 8], ['generate', 'sketch', 8],
    ['variations', 'text', 8], ['edit', 'text', 8], ['removeBg', 'text', 2], ['vectorize', 'text', 2],
  ]) {
    const h = await serviceHarness();
    const sourceId = id();
    h.change(project => project.canvas_data.jobs.push({ id: sourceId, status: 'succeeded', format: 'png', url: 'https://storage.test/source.png' }));
    await h.service.startLogoOperation('owner', h.snapshot(), input({ operation, mode, sourceId, creditCost: 0 }));
    assert.equal([...h.charges.values()][0].amount, expected, `${operation}/${mode}`);
    assert.equal(h.snapshot().canvas_data.jobs.at(-1).creditCost, expected);
  }
});

test('four successful outputs total 32 credits in every creation mode', async () => {
  for (const [mode, expected] of [['text', 32], ['image', 32], ['sketch', 32]]) {
    const h = await serviceHarness();
    for (let index = 0; index < 4; index++) await h.service.startLogoOperation('owner', h.snapshot(), input({ mode, ...(mode !== 'text' ? { sourceUrl: 'https://storage.test/source.png' } : {}) }));
    assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), expected);
    for (const job of h.snapshot().canvas_data.jobs) await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
    assert.equal(h.snapshot().canvas_data.jobs.filter(job => job.status === 'succeeded').length, 4);
  }
});

test('failed requests refund the actual charge at the new prices', async () => {
  for (const [mode, expected] of [['text', 8], ['image', 8], ['sketch', 8]]) {
    const h = await serviceHarness({ providerFailure: true });
    await h.service.startLogoOperation('owner', h.snapshot(), input({ mode, ...(mode !== 'text' ? { sourceUrl: 'https://storage.test/source.png' } : {}) }));
    const charge = [...h.charges.values()][0];
    assert.equal(charge.amount, expected); assert.ok(h.refunded.has(charge.id));
    assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
  }
});

function seedLogos(h, count = 4) {
  h.change(project => { project.canvas_data.jobs = Array.from({ length: count }, () => ({
    id: id(), operation: 'generate', status: 'succeeded', format: 'png', url: 'https://storage.test/logo.png',
  })); });
}

test('quota counts originals, variations and reservations, excluding failures and refinements', () => {
  const jobs = [
    { operation: 'generate', status: 'succeeded' }, { operation: 'variations', status: 'queued' },
    { operation: 'generate', status: 'failed' }, { operation: 'edit', status: 'succeeded' },
    { operation: 'removeBg', status: 'succeeded' }, { operation: 'vectorize', status: 'succeeded' },
  ];
  assert.deepEqual(logoGenerationQuota(jobs), { used: 2, remaining: 2, limit: 4 });
});

test('four-logo limit rejects originals and variations before billing and preserves older projects', async () => {
  for (const count of [4, 6]) {
    const h = await serviceHarness(); seedLogos(h, count);
    for (const operation of ['generate', 'variations']) {
      await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation, sourceId: h.snapshot().canvas_data.jobs[0].id })), /4-logo limit/);
    }
    assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
    assert.equal(h.snapshot().canvas_data.jobs.length, count);
  }
});

test('concurrent requests cannot both reserve the final logo slot', async () => {
  const h = await serviceHarness(); seedLogos(h, 3); const snapshot = h.snapshot();
  const results = await Promise.allSettled([h.service.startLogoOperation('owner', snapshot, input()), h.service.startLogoOperation('owner', snapshot, input())]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(h.charges.size, 1); assert.equal(h.submissions.length, 1);
  assert.equal(logoGenerationQuota(h.snapshot().canvas_data.jobs).used, 4);
});

test('edits, background removal and vectorization remain available at the limit', async () => {
  for (const operation of ['edit', 'removeBg', 'vectorize']) {
    const h = await serviceHarness({ vector: operation === 'vectorize' }); seedLogos(h);
    await h.service.startLogoOperation('owner', h.snapshot(), input({ operation, sourceId: h.snapshot().canvas_data.jobs[0].id }));
    assert.equal(h.charges.size, 1); assert.equal(h.snapshot().canvas_data.jobs.length, 5);
    assert.equal(logoGenerationQuota(h.snapshot().canvas_data.jobs).used, 4);
  }
});

test('failed generations free their slot for retry', async () => {
  const h = await serviceHarness(); seedLogos(h);
  h.change(project => { project.canvas_data.jobs[3].status = 'failed'; });
  await h.service.startLogoOperation('owner', h.snapshot(), input());
  assert.equal(h.charges.size, 1); assert.equal(logoGenerationQuota(h.snapshot().canvas_data.jobs).used, 4);
});

test('rejects unsupported operations, palettes, missing sources, and oversized text before billing', () => {
  for (const changes of [{ operation: 'free-vectorize' }, { mode: 'video' }, { style: 'unknown' }, { palette: ['red'] }, { prompt: 'a'.repeat(1801) }, { operation: 'edit' }, { mode: 'sketch' }]) {
    assert.throws(() => input(changes));
  }
  assert.equal(input({ mode: 'image', sourceUrl: 'https://storage.test/source.png' }).mode, 'image');
  assert.equal(input({ operation: 'variations', sourceId: id(), prompt: '' }).operation, 'variations');
  assert.throws(() => input({ mode: 'sketch', sourceUrl: 'https://storage.test/sketch.png', sketchMode: 'trace' }), /Smart or Precise/);
});

test('Smart and Precise sketch prompts preserve the idea at different fidelity levels', () => {
  const brief = buildLogoPrompt(input({ mode: 'sketch', sourceUrl: 'https://storage.test/sketch.png', tagline: 'Stay curious', palette: ['#123abc'] }));
  assert.match(brief, /rough sketch/); assert.match(brief, /"Peak"/); assert.match(brief, /Stay curious/); assert.match(brief, /#123abc/);
  assert.match(brief, /Sketch interpretation/); assert.match(brief, /concept guide/);
  assert.doesNotMatch(brief, /layout blueprint/);
  const precise = buildLogoPrompt(input({ mode: 'sketch', sketchMode: 'precise', sourceUrl: 'https://storage.test/sketch.png' }));
  assert.match(precise, /Sketch fidelity/); assert.match(precise, /original positions/);
  assert.doesNotMatch(precise, /Sketch interpretation/);
  const edit = buildLogoPrompt(input({ operation: 'edit', sourceId: id(), prompt: 'Remove the star' }));
  assert.match(edit, /Apply only this instruction: Remove the star/);
  assert.doesNotMatch(edit, /Design one original/);
  assert.equal(LOGO_STYLES.length, 12);
});

test('prompt-free image creation gives each visual style its own subject-first logo direction', () => {
  const sourceUrl = 'https://storage.test/portrait.png';
  const mascot = buildLogoPrompt(input({ mode: 'image', style: 'mascot', prompt: '', sourceUrl }));
  const pictorial = buildLogoPrompt(input({ mode: 'image', style: 'pictorial', prompt: '', sourceUrl }));
  const abstract = buildLogoPrompt(input({ mode: 'image', style: 'abstract', prompt: '', sourceUrl }));
  for (const brief of [mascot, pictorial, abstract]) {
    assert.match(brief, /MAIN SUBJECT/);
    assert.match(brief, /strong silhouette/);
    assert.match(brief, /flat, clearly separated color shapes/);
    assert.match(brief, /No extra user prompt/);
  }
  assert.match(mascot, /head-and-shoulders or compact character pose/);
  assert.match(pictorial, /large negative-space cutouts/);
  assert.match(pictorial, /one flat ink color plus the background/);
  assert.match(pictorial, /Keep the arrangement of visible paired features/);
  assert.match(abstract, /distinctive gesture, contour, or relationship of parts/);
  assert.doesNotMatch(abstract, /never replace the subject with letters or abstract shapes/);
  assert.doesNotMatch(mascot, /large negative-space cutouts/);
});

test('all eight photo-first styles keep distinct visual construction rules', () => {
  const expected = {
    pictorial: /one dominant solid silhouette/,
    mascot: /heavy, clean outer contour/,
    retro: /mid-century character mark/,
    cartoon: /controlled rounded exaggeration/,
    abstract: /broad interlocking shapes/,
    line: /separate but coordinated contour strokes/,
    icon: /few rounded solid shapes/,
    engraved: /selective parallel hatching/,
  };
  for (const [style, visualRule] of Object.entries(expected)) {
    const brief = buildLogoPrompt(input({ mode: 'image', style, prompt: '', sourceUrl: 'https://storage.test/reference.png' }));
    assert.match(brief, visualRule, style);
    assert.match(brief, /Reference priority:/, style);
    assert.doesNotMatch(brief, /wordmark construction|monogram construction/i, style);
  }
});

test('image-based Badge keeps optional brand text inside its enclosure', () => {
  const brief = buildLogoPrompt(input({ mode: 'image', style: 'badge', brand: 'Wildbrew', tagline: 'Mountain coffee', prompt: '', sourceUrl: 'https://storage.test/reference.png' }));
  assert.match(brief, /outer rim or banner/);
  assert.match(brief, /exact brand name "Wildbrew" legibly within the badge/);
  assert.match(brief, /exact tagline "Mountain coffee".*inside the badge/);
  assert.doesNotMatch(brief, /lettering BELOW the illustration/);
});

test('photo-based Wordmark and Monogram keep exact lettering ahead of image motifs', () => {
  const sourceUrl = 'https://storage.test/portrait.png';
  const wordmark = buildLogoPrompt(input({ mode: 'image', style: 'wordmark', brand: 'Wildbrew', prompt: '', sourceUrl }));
  assert.match(wordmark, /complete name as one cohesive, custom lettering system/);
  assert.match(wordmark, /Borrow at most one recognizable contour or negative-space motif/);
  assert.match(wordmark, /exact brand name is "Wildbrew"/);
  assert.doesNotMatch(wordmark, /subject must remain larger/);

  assert.throws(() => input({ mode: 'image', style: 'monogram', brand: '', prompt: '', sourceUrl }), /brand name or main letters/);
  const monogram = buildLogoPrompt(input({ mode: 'image', style: 'monogram', brand: '', prompt: '', sourceUrl, designSettings: { monogramLetters: 'WB' } }));
  assert.match(monogram, /requested 1–3 letterforms the entire primary mark/);
  assert.match(monogram, /Main letters: "WB"/);
  assert.match(monogram, /do not trace the photo/);
  assert.doesNotMatch(monogram, /subject must remain larger/);
});

test('all four new styles validate and retain their visual direction in every creation mode', async () => {
  for (const styleId of ['pictorial', 'engraved', 'icon', 'cartoon']) {
    const style = LOGO_STYLES.find(item => item.id === styleId);
    assert.ok(style);
    assert.ok((await readFile(new URL(`../public/images/logo-styles/${styleId}.webp`, import.meta.url))).length > 0);
    for (const mode of ['text', 'image', 'sketch']) {
      const request = input({ style: styleId, mode, ...(mode === 'text' ? {} : { sourceUrl: 'https://storage.test/reference.png' }) });
      const plan = nanoLogoPlan(request, request.sourceUrl);
      if (mode === 'sketch') assert.ok(plan.input.prompt.includes(`Refinement style: ${style.name}: ${style.prompt}.`));
      else assert.ok(plan.input.prompt.includes(style.prompt));
      assert.equal(logoOperationCost('generate', mode), 8);
      assert.equal(plan.endpoint, mode === 'text' ? 'fal-ai/nano-banana-2' : 'fal-ai/nano-banana-2/edit');
      if (mode === 'sketch') assert.match(plan.input.prompt, /Sketch interpretation/);
      if (mode === 'image') assert.match(plan.input.prompt, /MAIN SUBJECT/);
    }
  }
});

test('public project snapshots omit billing IDs, provider inputs, and provider request IDs', () => {
  const result = publicLogoProject({ id: id(), canvas_data: { revision: 7, jobs: [{ ...input(), chargeId: 'secret', providerRequestId: 'private', sourceUrl: 'private', isOwnerTest: true }] } });
  const serialized = JSON.stringify(result);
  assert.equal(result.revision, 7);
  assert.doesNotMatch(serialized, /secret|private|isOwnerTest/);
});

test('only stale active jobs expire and every saved logo asset is included in retention', () => {
  const old = new Date(Date.now() - 16 * 60_000).toISOString();
  assert.equal(logoJobTimedOut({ status: 'queued', createdAt: old }), true);
  assert.equal(logoJobTimedOut({ status: 'succeeded', createdAt: old }), false);
  assert.equal(logoJobTimedOut({ status: 'refunding', createdAt: old }), false);
  assert.deepEqual(logoStudioAssetUrls({ tool: 'logo_studio', jobs: [{ url: 'https://s/1', sourceUrl: 'https://s/2' }, { url: 'https://s/1' }] }), ['https://s/1', 'https://s/2']);
  assert.deepEqual(logoStudioAssetUrls({ jobs: [{ url: 'https://s/1' }] }), []);
});

// Run the actual service with isolated I/O, not a second implementation of its rules.
async function serviceHarness(options = {}) {
  let project = { id: id(), user_id: 'owner', created_at: new Date().toISOString(), original_image_url: null, canvas_data: { tool: 'logo_studio', revision: 0, jobs: [] } };
  const sign = () => { project.canvas_data.signature = signLogoState(project.canvas_data, 'owner', project.id, 'test-signing-secret'); };
  sign();
  const charges = new Map(); const refunded = new Set(); const submissions = []; const uploads = []; const usages = [];
  let conflict = options.conflict;
  const adminSupabase = { from(table) {
    const query = { filters: [], value: null,
      select() { return this; }, eq(field, value) { this.filters.push([field, value]); return this; }, update(value) { this.value = value; return this; },
      async maybeSingle() {
        if (table === 'profiles') return { data: { credits: options.insufficient ? 0 : 1000 } };
        if (table === 'credit_logs') return { data: [...charges.values()].find(c => this.filters.some(([key, value]) => key === 'idempotency_key' && c.key === value)) || null };
        const expected = this.filters.find(([key]) => key === 'canvas_data->>revision')?.[1];
        if (expected !== String(project.canvas_data.revision)) return { data: null, error: null };
        if (conflict) { conflict = false; project.canvas_data.revision++; sign(); return { data: null, error: null }; }
        Object.assign(project, structuredClone(this.value)); return { data: structuredClone(project), error: null };
      },
    }; return query;
  } };
  const deps = {
    validateLogoSvg: () => {},
    generateRecraftLogo: async (request, sourceBuffer, sourceFormat) => {
      submissions.push({ request, sourceBuffer, sourceFormat });
      if (options.providerFailure) throw new Error('Provider failed');
      return { url: 'https://provider.test/result.svg', format: request.operation === 'removeBg' && sourceFormat !== 'svg' ? 'png' : 'svg',
        endpoint: request.operation === 'generate' ? 'images/generations' : 'images/imageToImage', model: 'recraftv4_1_vector', providerRequestId: id(), cost: 0.08 };
    },
    randomUUID: id, planLogoDirections: async (...args) => { if (options.plannerFailure) throw new Error('Planner failed'); const result = await planLogoDirections(args[0], args[1], { env: {} }); if (options.plannerMetadata) result.metadata = options.plannerMetadata; return result; }, compileLogoDirection, LOGO_COMPILER_VERSION,
    adminSupabase, nanoLogoPlan, LOGO_ACTIVE, LOGO_COST, logoOperationCost, logoGenerationQuota, buildLogoPrompt, logoJobTimedOut, signLogoState, verifyLogoState,
    fitImageLogoToArtboard: async buffer => buffer,
    PROJECT_ACCESS: { OWNER: 'owner', EDIT: 'edit', VIEW: 'view' },
    getProjectAccess: async (userId, projectId, { required = 'view' } = {}) => {
      const access = userId === 'owner' ? 'owner' : options.collaborators?.[userId];
      const rank = { view: 1, edit: 2, owner: 3 };
      const allowed = projectId === project.id && rank[access] >= rank[required] && !options.expired;
      return { project: allowed ? structuredClone(project) : null, access: access || null, error: allowed ? null : 'Project access denied' };
    },
    chargeCreditsVerified: async args => {
      if (options.insufficient) { const err = new Error('INSUFFICIENT_CREDITS'); err.code = err.message; throw err; }
      const replayed = charges.has(args.idempotencyKey);
      if (!replayed) charges.set(args.idempotencyKey, { id: id(), key: args.idempotencyKey, userId: args.userId, amount: args.amount, transaction_status: 'pending' });
      return { transactionId: charges.get(args.idempotencyKey).id, isOwnerTest: false, replayed };
    },
    refundCreditVerified: async ({ chargeTransactionId }) => { if (options.refundUnavailable) throw new Error('Refund connection failed'); refunded.add(chargeTransactionId); return { refunded: true }; },
    markCreditTransaction: async ({ transactionId, status, metadata }) => { const charge = [...charges.values()].find(item => item.id === transactionId); if (charge) Object.assign(charge, { transaction_status: status, metadata }); return true; },
    recordProviderUsage: async args => usages.push(args),
    uploadToR2: async (buffer, path) => { if (options.saveFailure) throw new Error('Storage failed'); uploads.push(path); return `https://storage.test/${path}`; },
    isOwnedStorageUrl: url => url.startsWith('https://storage.test/'),
    getAllowedProviderHosts: () => ['provider.test'], getAllowedStorageHosts: () => ['storage.test'],
    DEFAULT_MAX_IMAGE_BYTES: 1000, DEFAULT_MAX_SVG_BYTES: 1000,
    fetchWithSSRFProtection: async () => ({ response: { ok: true }, buffer: Buffer.from(!options.raster ? '<svg><path d="M0 0h1v1z" /></svg>' : 'image') }),
    sharp: () => ({ metadata: async () => ({ format: 'png' }), resize() { return this; }, png() { return this; }, toBuffer: async () => Buffer.from('png') }),
    fal: { queue: {
      submit: async (endpoint, request) => { submissions.push({ endpoint, request }); if (options.providerFailure) throw new Error('Provider failed'); return { request_id: id() }; },
      status: async () => { if (options.statusOutage) throw new Error('Network offline'); return { status: options.status || 'COMPLETED' }; },
      result: async () => ({ data: { images: [{ url: 'https://provider.test/result.png' }] } }),
    } },
  };
  const source = (await readFile(new URL('../src/lib/logoStudioServer.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ ...deps, structuredClone, Buffer, Blob, FormData, AbortSignal, Date, console: { error() {} }, process: { env: { LOGO_ART_DIRECTION_ENABLED: options.artDirection ? 'true' : 'false', FAL_KEY: 'test-only', RECRAFT_API_KEY: 'test-only', SUPABASE_SERVICE_ROLE_KEY: 'test-signing-secret' } }, fetch: async () => ({ ok: true, json: async () => ({ image: { url: 'https://provider.test/result.svg' } }), headers: new Headers() }) });
  const service = vm.runInContext(`${source}\n({ accessibleLogoProject, ownedLogoProject, startLogoOperation, startLogoTextBatch, refreshLogoJob, mutateLogoProject })`, context);
  return { service, charges, refunded, submissions, uploads, usages, snapshot: () => structuredClone(project), legacyPending: requestId => {
    uploads.length = 0;
    const job = project.canvas_data.jobs.find(job => job.id === requestId);
    Object.assign(job, { status: 'queued', endpoint: 'fal-ai/nano-banana-pro', providerRequestId: id(), provider: 'fal' });
    delete job.url; delete job.format; delete job.providerOutputUrl;
    const charge = [...charges.values()].find(charge => charge.id === job.chargeId);
    charge.transaction_status = 'pending'; delete charge.metadata; sign();
  }, change: fn => { fn(project); sign(); }, restore: snapshot => { project = structuredClone(snapshot); } };
}

test('text batch reserves once, plans distinct directions and charges only requested outputs under replay', async () => {
  const h = await serviceHarness({ artDirection: true }); const request = input();
  await Promise.all([h.service.startLogoTextBatch('owner', h.snapshot(), request, 3), h.service.startLogoTextBatch('owner', h.snapshot(), request, 3)]);
  await h.service.startLogoTextBatch('owner', h.snapshot(), request, 3);
  assert.equal(h.charges.size, 3); assert.equal(h.submissions.length, 3);
  const state = h.snapshot().canvas_data;
  assert.equal(state.batches.length, 1); assert.equal(state.jobs.length, 3);
  assert.equal(new Set(state.jobs.map(j => j.compiledPrompt)).size, 3);
  assert.equal(h.usages.filter(u => u.endpoint === 'logo-art-direction').length, 1);
  assert.equal(verifyLogoState(state, 'owner', h.snapshot().id, 'test-signing-secret'), true);
  assert.doesNotMatch(JSON.stringify(publicLogoProject(h.snapshot())), /compiledPrompt|designBrief|submissionClaimed|planner|directionId/);
});

test('text batch records reported fal planner cost once under replay and preserves unknown cost', async () => {
  for (const cost of [0.0000747, 0, null]) {
    const h = await serviceHarness({ artDirection: true, plannerMetadata: { mode: 'ai', provider: 'fal', endpoint: 'openrouter/router', model: 'qwen/qwen3-30b-a3b-instruct-2507', usage: { cost } } });
    const request = input();
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    const usage = h.usages.filter(u => u.endpoint === 'openrouter/router');
    assert.equal(usage.length, 1);
    assert.equal(usage[0].provider, 'fal');
    assert.equal(usage[0].estimatedCostUsd, cost);
    assert.equal(usage[0].metadata.imageCalls, 0);
  }
});

test('text generation freezes public design controls in the batch and enforces them with art direction on or off', async () => {
  for (const artDirection of [true, false]) {
    const h = await serviceHarness({ artDirection });
    const request = input({ style: 'wordmark', designSettings: { fontFamily: 'sans', composition: 'horizontal', detail: 'detailed' } });
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    const job = h.snapshot().canvas_data.jobs[0];
    assert.deepEqual(job.designSettings, request.designSettings);
    assert.deepEqual(publicLogoProject(h.snapshot()).jobs[0].designSettings, request.designSettings);
    assert.match(h.submissions[0].request.input.prompt, /Font style: Sans font/);
    assert.match(h.submissions[0].request.input.prompt, /do not stack or curve/);
  }
});

test('batch quota validation and authorization occur before planning or billing', async () => {
  const h = await serviceHarness({ artDirection: true }); seedLogos(h, 3);
  await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), input(), 2), /slots/);
  await assert.rejects(h.service.startLogoTextBatch('viewer', h.snapshot(), input(), 1));
  for (const count of [0, 5, 1.5, '2']) await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), input(), count));
  assert.equal(h.charges.size, 0); assert.equal(h.usages.length, 0);
  const empty = await serviceHarness({ insufficient: true, artDirection: true });
  await assert.rejects(empty.service.startLogoTextBatch('owner', empty.snapshot(), input(), 1), /credits/);
  assert.equal(empty.snapshot().canvas_data.jobs.length, 0); assert.equal(empty.usages.length, 0);
});

test('batch failure releases reservations without charging for preparation', async () => {
  const h = await serviceHarness({ artDirection: true, plannerFailure: true });
  await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), input(), 2));
  assert.equal(h.charges.size, 0); assert.equal(logoGenerationQuota(h.snapshot().canvas_data.jobs).used, 0);
});

test('rejected image submissions refund each batch slot; feature rollback uses baseline prompts', async () => {
  const failed = await serviceHarness({ artDirection: true, providerFailure: true });
  await failed.service.startLogoTextBatch('owner', failed.snapshot(), input(), 2);
  assert.equal(failed.refunded.size, 2); assert.equal(logoGenerationQuota(failed.snapshot().canvas_data.jobs).used, 0);
  const baseline = await serviceHarness(); const request = input();
  await baseline.service.startLogoTextBatch('owner', baseline.snapshot(), request, 1);
  assert.equal(baseline.submissions[0].request.input.prompt, buildLogoPrompt(request));
  assert.equal(baseline.usages.length, 0);
});

test('a request replay submits once and charges once, including simultaneous tabs', async () => {
  const h = await serviceHarness(); const request = input(); const snapshot = h.snapshot();
  await Promise.all([h.service.startLogoOperation('owner', snapshot, request), h.service.startLogoOperation('owner', snapshot, request)]);
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  assert.equal(h.charges.size, 1); assert.equal(h.submissions.length, 1); assert.equal(h.snapshot().canvas_data.jobs.length, 1);
});

test('compare-and-swap retries preserve concurrent updates', async () => {
  const h = await serviceHarness({ conflict: true });
  await h.service.startLogoOperation('owner', h.snapshot(), input());
  assert.equal(h.submissions.length, 1); assert.ok(h.snapshot().canvas_data.revision >= 4);
});

test('a refreshed project recovers a legacy fal job and stores a permanent PNG', async () => {
  const h = await serviceHarness(); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  await Promise.all([h.service.refreshLogoJob('owner', h.snapshot(), request.requestId), h.service.refreshLogoJob('owner', h.snapshot(), request.requestId)]);
  const saved = h.snapshot().canvas_data.jobs[0];
  assert.equal(saved.status, 'succeeded'); assert.equal(saved.format, 'png');
  assert.equal(h.uploads.length, 1); assert.equal(h.refunded.size, 0);
  assert.equal(h.snapshot().original_image_url, saved.url);
});

test('failed slots refund only their own charge, preserving successful batch outputs', async () => {
  const h = await serviceHarness({ saveFailure: true }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.change(project => project.canvas_data.jobs.push({ id: id(), status: 'succeeded', url: 'https://storage.test/prior.png', format: 'png' }));
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
  assert.equal(h.snapshot().canvas_data.jobs[1].status, 'succeeded'); assert.equal(h.refunded.size, 1);
});

test('insufficient credit never submits a provider request', async () => {
  const h = await serviceHarness({ insufficient: true });
  await h.service.startLogoOperation('owner', h.snapshot(), input());
  assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0); assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
});

test('a transient status outage leaves the pending charge and job intact', async () => {
  const h = await serviceHarness({ statusOutage: true }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'queued'); assert.equal(h.refunded.size, 0);
});

test('stale jobs reconcile a charge saved before a crash, and refunds remain idempotent', async () => {
  const h = await serviceHarness({ status: 'IN_PROGRESS' }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  h.change(project => { const job = project.canvas_data.jobs[0]; delete job.chargeId; job.updatedAt = new Date(Date.now() - 16 * 60_000).toISOString(); });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.refunded.size, 1); assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
});

test('completed provider outputs remain recoverable after a long browser absence', async () => {
  const h = await serviceHarness(); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  h.change(project => { project.canvas_data.jobs[0].updatedAt = new Date(Date.now() - 60 * 60_000).toISOString(); });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded'); assert.equal(h.refunded.size, 0);
});

test('server signatures bind billing state to the owner and project and survive JSONB key ordering', () => {
  const state = { tool: 'logo_studio', jobs: [{ id: 'job', chargeId: 'charge' }], revision: 1 };
  state.signature = signLogoState(state, 'owner', 'project', 'secret');
  const reordered = { revision: 1, jobs: [{ chargeId: 'charge', id: 'job' }], tool: 'logo_studio', signature: state.signature };
  assert.equal(verifyLogoState(reordered, 'owner', 'project', 'secret'), true);
  assert.equal(verifyLogoState(reordered, 'other', 'project', 'secret'), false);
  reordered.jobs[0].chargeId = 'forged-charge';
  assert.equal(verifyLogoState(reordered, 'owner', 'project', 'secret'), false);
});

test('replaying an old signed snapshot cannot generate a second output for one charge', async () => {
  const h = await serviceHarness(); const request = input(); const initial = h.snapshot();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  const savedUrl = h.snapshot().canvas_data.jobs[0].url;
  h.restore(initial);
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  assert.equal(h.submissions.length, 1); assert.equal(h.charges.size, 1);
  assert.equal(h.snapshot().canvas_data.jobs[0].url, savedUrl);
});

test('replaying a pending snapshot cannot refund a completed charge', async () => {
  const h = await serviceHarness({ status: 'IN_PROGRESS' }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  const pending = h.snapshot();
  const charge = [...h.charges.values()][0];
  charge.transaction_status = 'succeeded'; charge.metadata = { logoOutput: { url: 'https://storage.test/completed.png', format: 'png' } };
  h.restore(pending);
  h.change(project => { project.canvas_data.jobs[0].updatedAt = new Date(Date.now() - 16 * 60_000).toISOString(); });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.refunded.size, 0); assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded');
});

test('a failed refund stays recoverable rather than falsely reporting a refund', async () => {
  const h = await serviceHarness({ providerFailure: true, refundUnavailable: true });
  await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input()), /Refund connection failed/);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'refunding'); assert.equal(h.refunded.size, 0);
});

test('shared readers verify the owner signature while sharing management stays owner-only', async () => {
  const h = await serviceHarness({ collaborators: { editor: 'edit', viewer: 'view' } });
  for (const [userId, expected] of [['owner', 'owner'], ['editor', 'edit'], ['viewer', 'view']]) {
    const authorized = await h.service.accessibleLogoProject(userId, h.snapshot().id);
    assert.equal(authorized.access, expected);
    assert.equal(verifyLogoState(authorized.project.canvas_data, 'owner', h.snapshot().id, 'test-signing-secret'), true);
  }
  for (const userId of ['editor', 'viewer', 'uninvited']) {
    await assert.rejects(h.service.ownedLogoProject(userId, h.snapshot().id), /not found/);
  }
});

test('view-only and uninvited accounts cannot mutate or charge shared logo projects', async () => {
  const h = await serviceHarness({ collaborators: { viewer: 'view' } });
  for (const userId of ['viewer', 'uninvited']) {
    await assert.rejects(h.service.startLogoOperation(userId, h.snapshot(), input()), /not found/);
    await assert.rejects(h.service.mutateLogoProject(userId, h.snapshot().id, state => state), /not found/);
  }
  assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
});

test('editor generations charge the editor and owner polling attributes provider usage to that editor', async () => {
  const h = await serviceHarness({ collaborators: { editor: 'edit' } });
  const request = input();
  await h.service.startLogoOperation('editor', h.snapshot(), request);
  assert.equal([...h.charges.values()][0].userId, 'editor');
  assert.equal([...h.charges.values()][0].amount, 8);
  assert.equal(h.snapshot().canvas_data.jobs[0].billedUserId, 'editor');
  assert.equal(verifyLogoState(h.snapshot().canvas_data, 'owner', h.snapshot().id, 'test-signing-secret'), true);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded');
  assert.equal(h.usages[0].userId, 'editor');
  assert.equal(h.charges.size, 1);
  assert.doesNotMatch(JSON.stringify(publicLogoProject(h.snapshot(), 'view')), /billedUserId|chargeId|providerRequestId/);
});

test('revoked and expired collaborators lose access before another generation can be charged', async () => {
  const collaborators = { editor: 'edit' };
  const h = await serviceHarness({ collaborators });
  const stale = h.snapshot();
  delete collaborators.editor;
  await assert.rejects(h.service.accessibleLogoProject('editor', stale.id), /not found/);
  await assert.rejects(h.service.startLogoOperation('editor', stale, input()), /not found/);
  const expired = await serviceHarness({ collaborators: { editor: 'edit', viewer: 'view' }, expired: true });
  for (const userId of ['owner', 'editor', 'viewer']) {
    await assert.rejects(expired.service.accessibleLogoProject(userId, expired.snapshot().id), /not found/);
  }
  assert.equal(h.charges.size, 0); assert.equal(expired.charges.size, 0);
});

test('owner reconciliation refunds the original editor charge when a shared output fails to save', async () => {
  const h = await serviceHarness({ collaborators: { editor: 'edit' }, saveFailure: true });
  const request = input();
  await h.service.startLogoOperation('editor', h.snapshot(), request);
  const charge = [...h.charges.values()][0];
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(charge.userId, 'editor');
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
  assert.equal(h.refunded.has(charge.id), true);
  assert.equal(h.charges.size, 1);
});

test('owner and editor generations share the same four-logo quota', async () => {
  const h = await serviceHarness({ collaborators: { editor: 'edit' } });
  seedLogos(h, 3);
  const snapshot = h.snapshot();
  const results = await Promise.allSettled(['owner', 'editor'].map(userId => h.service.startLogoOperation(userId, snapshot, input())));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(h.charges.size, 1);
  assert.equal(logoGenerationQuota(h.snapshot().canvas_data.jobs).used, 4);
});

async function logoRoutes(h, exportRoute = false) {
  const file = exportRoute ? '../src/app/api/logo-studio/export/route.js' : '../src/app/api/logo-studio/route.js';
  const source = (await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${source}\n({ ${exportRoute ? 'POST' : 'GET, POST'} })`, {
    ...h.service, publicLogoProject, validateLogoOperation, UUID: /^[0-9a-f-]{36}$/i,
    PROJECT_ACCESS: { OWNER: 'owner', EDIT: 'edit', VIEW: 'view' },
    authenticateRequest: async request => ({ user: { id: request.headers.get('x-test-user') } }),
    enforceRateLimit: async () => ({ success: true }),
    NextResponse: { json: (body, options) => Response.json(body, options) },
    URL, Response, Buffer, crypto,
    LOGO_EXPORT_FORMATS, resolveLogoExportJob,
    createLogoExport: async () => Buffer.from('exported PNG'),
    fetchWithSSRFProtection: async () => ({ response: { ok: true }, buffer: Buffer.from('stored image') }),
    getAllowedStorageHosts: () => ['storage.test'], DEFAULT_MAX_IMAGE_BYTES: 1000, DEFAULT_MAX_SVG_BYTES: 1000,
  });
}

test('logo routes expose authorized access roles and reject view-only and uninvited writes', async () => {
  for (const [userId, access] of [['owner', 'owner'], ['editor', 'edit'], ['viewer', 'view'], ['uninvited', null]]) {
    const h = await serviceHarness({ collaborators: { editor: 'edit', viewer: 'view' } });
    const routes = await logoRoutes(h);
    const url = `https://syncraft.test/api/logo-studio?id=${h.snapshot().id}`;
    const read = await routes.GET(new Request(url, { headers: { 'x-test-user': userId } }));
    assert.equal(read.ok, !!access);
    if (access) assert.equal((await read.json()).project.access, access);
    const write = await routes.POST(new Request(url, { method: 'POST', headers: { 'x-test-user': userId }, body: JSON.stringify({ ...input(), projectId: h.snapshot().id }) }));
    const canWrite = ['owner', 'edit'].includes(access);
    assert.equal(write.ok, canWrite);
    assert.equal(h.charges.size, canWrite ? 1 : 0);
    if (canWrite) assert.equal([...h.charges.values()][0].userId, userId);
  }
});

test('saved logo downloads are available to invited viewers but denied after access is revoked', async () => {
  const collaborators = { viewer: 'view' };
  const h = await serviceHarness({ collaborators });
  const jobId = id();
  h.change(project => project.canvas_data.jobs.push({ id: jobId, status: 'succeeded', format: 'png', url: 'https://storage.test/logo.png' }));
  const routes = await logoRoutes(h, true);
  const request = () => new Request('https://syncraft.test/api/logo-studio/export', { method: 'POST', headers: { 'x-test-user': 'viewer' }, body: JSON.stringify({ projectId: h.snapshot().id, jobId, format: 'png' }) });
  const allowed = await routes.POST(request());
  assert.equal(allowed.ok, true);
  assert.equal(allowed.headers.get('Content-Type'), 'image/png');
  delete collaborators.viewer;
  assert.equal((await routes.POST(request())).ok, false);
  assert.equal(h.charges.size, 0);
});

test('another user cannot read a logo project or submit operations against it', async () => {
  const h = await serviceHarness();
  await assert.rejects(h.service.ownedLogoProject('other-user', h.snapshot().id), /not found/);
  await assert.rejects(h.service.startLogoOperation('other-user', h.snapshot(), input()), /not found/);
  assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
});

test('SVG export produces a vector derivative without changing the source PNG', async () => {
  const h = await serviceHarness({ vector: true }); const sourceId = id();
  h.change(project => project.canvas_data.jobs.push({ id: sourceId, status: 'succeeded', format: 'png', url: 'https://storage.test/source.png' }));
  await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'vectorize', sourceId }));
  assert.equal(h.snapshot().canvas_data.jobs[0].format, 'png');
  assert.equal(h.snapshot().canvas_data.jobs[1].format, 'svg'); assert.equal(h.submissions.length, 1); assert.equal(h.refunded.size, 0);
});

test('new generation queues Nano Banana 2, saves PNG and records the correct provider cost', async () => {
  const h = await serviceHarness();
  await h.service.startLogoOperation('owner', h.snapshot(), input());
  const pending = h.snapshot().canvas_data.jobs[0];
  assert.equal(pending.provider, 'fal'); assert.equal(pending.endpoint, 'fal-ai/nano-banana-2'); assert.equal(pending.status, 'queued');
  await h.service.refreshLogoJob('owner', h.snapshot(), pending.id);
  const project = h.snapshot(); const job = project.canvas_data.jobs[0];
  assert.equal(job.provider, 'fal'); assert.equal(job.format, 'png'); assert.equal(job.status, 'succeeded');
  assert.equal(project.original_image_url, job.url);
  assert.equal(h.usages[0].provider, 'fal'); assert.equal(h.usages[0].estimatedCostUsd, 0.08);
  assert.equal(h.refunded.size, 0);
});

test('saved SVG supports edit, variations and background removal; vectorize rejects before charging', async () => {
  for (const operation of ['edit', 'variations', 'removeBg', 'vectorize']) {
    const h = await serviceHarness(); const sourceId = id();
    h.change(project => project.canvas_data.jobs.push({ id: sourceId, status: 'succeeded', format: 'svg', url: 'https://storage.test/source.svg' }));
    if (operation === 'vectorize') {
      await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation, sourceId })), /already a vector/);
      assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
    } else {
      await h.service.startLogoOperation('owner', h.snapshot(), input({ operation, sourceId }));
      if (operation !== 'removeBg') {
        assert.equal(h.submissions[0].endpoint, 'fal-ai/nano-banana-2/edit');
        assert.match(h.submissions[0].request.input.image_urls[0], /^data:image\/png;base64,/);
        await h.service.refreshLogoJob('owner', h.snapshot(), h.snapshot().canvas_data.jobs[1].id);
      }
      assert.equal(h.snapshot().canvas_data.jobs[1].status, 'succeeded');
      assert.equal(h.snapshot().canvas_data.jobs[1].format, operation === 'removeBg' ? 'svg' : 'png');
    }
  }
});

test('a persisted Recraft output resumes saving without generating or charging again', async () => {
  const h = await serviceHarness(); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.change(project => {
    const job = project.canvas_data.jobs[0]; job.status = 'saving'; job.provider = 'recraft';
    job.providerOutputUrl = 'https://provider.test/prior.svg'; job.outputFormat = 'svg';
    job.updatedAt = new Date(Date.now() - 120_000).toISOString(); delete job.url; delete job.format;
  });
  h.uploads.length = 0;
  await Promise.all([h.service.refreshLogoJob('owner', h.snapshot(), request.requestId), h.service.refreshLogoJob('owner', h.snapshot(), request.requestId)]);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded');
  assert.equal(h.submissions.length, 1); assert.equal(h.charges.size, 1); assert.equal(h.uploads.length, 1);
});

test('Nano creation plus a single Recraft vectorization costs 10 credits and duplicate vectorization is blocked', async () => {
  const h = await serviceHarness(); const create = input();
  await h.service.startLogoOperation('owner', h.snapshot(), create);
  await h.service.refreshLogoJob('owner', h.snapshot(), create.requestId);
  await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'vectorize', sourceId: create.requestId }));
  assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), 10);
  assert.equal(h.snapshot().canvas_data.jobs[0].format, 'png');
  assert.equal(h.snapshot().canvas_data.jobs[1].format, 'svg');
  await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'vectorize', sourceId: create.requestId })), /SVG already exists/);
  assert.equal(h.charges.size, 2); assert.equal(h.submissions.length, 2);
});

test('a legacy six-credit job refunds its original transaction after the ten-credit price change', async () => {
  const h = await serviceHarness({ status: 'IN_PROGRESS' }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  const charge = [...h.charges.values()][0]; charge.amount = 6;
  h.change(project => { const job = project.canvas_data.jobs[0]; job.creditCost = 6; job.updatedAt = new Date(Date.now() - 16 * 60_000).toISOString(); });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.ok(h.refunded.has(charge.id)); assert.equal(charge.amount, 6); assert.equal(h.charges.size, 1);
});
