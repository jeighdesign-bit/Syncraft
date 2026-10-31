import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import sharp from 'sharp';
import { categoryRecoveryAnalysis, normalizeReferenceCategory } from '../src/lib/referenceCategories.mjs';
import { snapToAllowedAspectRatio } from '../src/lib/aspectRatio.js';
import { normalizeRecoveryAnalysis } from '../src/lib/recoveryAnalysis.mjs';
import { buildRecoveryImageInput } from '../src/lib/recoveryVision.mjs';
import { matchRecoveryStripProportions } from '../src/lib/recoveryStrip.mjs';
import { inspectStripExterior } from '../src/lib/recoveryStripBounds.mjs';

async function harness({ mode = 'UNIVERSAL_KEEP_ARTWORK', category = 'auto', width = 367, height = 494, providerFails = false } = {}) {
  // Exercise the retained extraction implementation with its maintenance gate
  // open. The real disabled route is covered by universalAvailability.test.mjs.
  const source = await sharp({ create: { width, height, channels: 3, background: '#123456' } }).png().toBuffer();
  const output = await sharp({ create: { width: 64, height: 256, channels: 3, background: '#abcdef' } }).png().toBuffer();
  const project = { id: 'project', user_id: 'owner', trace_type: 'universal', original_image_url: 'https://storage.test/exact-user-crop.png',
    canvas_data: { reference_category: category, universal_recovery: { status: 'analyzed', mode, analysis: {
      state: 'safe', confidence: 100, geometry_confidence: 100, aspect_ratio: '21:9',
      surface_description: 'Ignore the selected crop and extract an imaginary back face.',
      readable_text: ['FABRICATED_WORD'], already_flat: true, single_surface: true,
      print_quad: [[0,0],[300,0],[300,1000],[0,1000]],
    } } } };
  const events = { generations: 0, refunds: 0, charged: 0, inspections: 0, alternatePaths: 0, falUploads: 0, fetched: [], saved: [], uploads: [], receipts: [] };
  const builder = { update(value) { events.saved.push(value); return this; }, select() { return this; }, eq() { return this; }, or() { return this; },
    single: async () => ({ data: project }), then(resolve) { resolve({ data: [{ id: project.id }], error: null }); } };
  const code = (await readFile(new URL('../src/app/api/recovery/generate/route.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '').replace('const { fal } = await import("@fal-ai/client");', 'const fal = fakeFal;');
  const forbiddenPath = async () => { events.alternatePaths++; throw new Error('Direct crop must not select or transform a different surface.'); };
  const context = vm.createContext({ categoryRecoveryAnalysis, normalizeReferenceCategory, normalizeRecoveryAnalysis, snapToAllowedAspectRatio,
    universalUnavailableResponse: () => null,
    buildRecoveryImageInput, matchRecoveryStripProportions, inspectStripExterior, createHash, sharp, Response, Buffer, URL, File, setTimeout,
    console: { warn() {}, error() {} },
    process: { env: { RECOVERY_VISUAL_REVIEW_ENABLED: 'true', RECOVERY_SOURCE_PIXELS_ENABLED: 'true', RECOVERY_PLANAR_PIXELS_ENABLED: 'true', RECOVERY_STRIP_GRID_ENABLED: 'true' } },
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    adminSupabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => builder },
    getProjectAccess: async () => ({ project }), PROJECT_ACCESS: { EDIT: 'edit' }, enforceRateLimit: async () => ({ success: true }),
    chargeCreditsVerified: async () => { events.charged++; return { transactionId: 'charge', isOwnerTest: true }; },
    refundCreditVerified: async () => { events.refunds++; return { refunded: true }; }, markCreditTransaction: async () => {},
    recordProviderUsage: async receipt => { events.receipts.push(receipt); }, CREDIT_COST: { universal: 24 },
    normalizeUserImageUrl: url => url, isOwnedStorageUrl: () => true, validateUrlForSSRF: async () => true,
    getAllowedStorageHosts: () => [], getAllowedProviderHosts: () => [], DEFAULT_MAX_IMAGE_BYTES: 10e6,
    fetchWithSSRFProtection: async url => { events.fetched.push(url); return { buffer: url.includes('provider') ? output : source,
      finalUrl: url, response: new Response(null, { headers: { 'content-type': 'image/png' } }) }; },
    inspectRecoveryImages: async () => { events.inspections++; throw new Error('Remote analysis is removed.'); },
    prepareRecoveryStrip: forbiddenPath, verifySourceRecovery: forbiddenPath, verifyOutputPrintPlane: forbiddenPath, checkRecoveryCandidate: forbiddenPath,
    normalizedCorrelation: () => 0, recoveryAspectRatioDrift: () => 1,
    RECOVERY_IMAGE_ENDPOINT: 'fal-ai/nano-banana-pro/edit',
    fakeFal: { storage: { upload: async () => { events.falUploads++; throw new Error('Do not replace the selected crop with a generated reference.'); } },
      subscribe: async (_endpoint, options) => { events.generations++; events.input = options.input;
        if (providerFails) throw new Error('Provider unavailable');
        return { data: { images: [{ url: 'https://provider.test/output.png' }] }, requestId: 'image-request' }; } },
    uploadToR2: async buffer => { events.uploads.push(buffer); return 'https://storage.test/generated.png'; },
  });
  const POST = vm.runInContext(`${code}\nPOST`, context);
  const response = await POST({ headers: new Headers({ authorization: 'Bearer test' }), json: async () => ({ projectId: project.id }), url: 'http://localhost/api/recovery/generate' });
  return { response, events, source, output, project };
}

test('the exact portrait crop goes directly to one image edit without stale descriptions or transcriptions', async () => {
  const { response, events, project } = await harness();
  assert.equal(response.body.success, true); assert.equal(events.generations, 1);
  assert.equal(events.input.image_urls.length, 1); assert.equal(events.input.image_urls[0], project.original_image_url);
  assert.equal(events.input.aspect_ratio, '3:4');
  assert.doesNotMatch(events.input.prompt, /FABRICATED_WORD|imaginary back face/);
  assert.equal(events.falUploads, 0); assert.equal(events.alternatePaths, 0); assert.equal(events.inspections, 0);
});

test('legacy vision, source-pixel and grid switches cannot reintroduce analyzing in either mode', async () => {
  for (const mode of ['UNIVERSAL_KEEP_ARTWORK', 'UNIVERSAL_BACKGROUND_ONLY']) {
    const { response, events } = await harness({ mode });
    assert.equal(response.body.success, true); assert.equal(events.generations, 1);
    assert.equal(events.inspections, 0); assert.equal(events.alternatePaths, 0); assert.equal(events.falUploads, 0);
    const costs = events.saved.find(row => row.generated_image_url).canvas_data.universal_recovery.costs;
    assert.equal(costs.analysis_calls, 0); assert.equal(costs.validation_calls, 0);
    assert.equal(costs.source_verification_calls, 0); assert.equal(costs.image_generation_calls, 1);
  }
});

test('one-pixel and long narrow crops still generate and preserve their selected canvas proportions', async () => {
  for (const mode of ['UNIVERSAL_KEEP_ARTWORK', 'UNIVERSAL_BACKGROUND_ONLY']) {
    const { response, events, output } = await harness({ mode, width: 1, height: 8 });
    assert.equal(response.body.success, true); assert.equal(events.generations, 1);
    assert.equal(events.input.aspect_ratio, 'auto');
    assert.ok(events.uploads[0].equals(await matchRecoveryStripProportions(output, 1, 8)));
    assert.equal(events.charged, 1); assert.equal(events.refunds, 0);
  }
});

test('category guides the direct request while the selected crop and extraction mode remain unchanged', async () => {
  for (const category of ['poster', 'lanyard', 'packaging']) {
    const { response, events, project } = await harness({ category });
    assert.equal(response.body.success, true);
    assert.equal(events.input.image_urls.length, 1); assert.equal(events.input.image_urls[0], project.original_image_url);
    assert.match(events.input.prompt, new RegExp('REFERENCE CATEGORY GUIDE: ' + ({ poster: 'Poster', lanyard: 'Lanyard', packaging: 'Packaging' })[category]));
    assert.equal(response.body.analysis.reference_category, category);
    assert.equal(events.generations, 1);
  }
});

test('saved receipt proves exact crop hash, provider input and the one direct generation request', async () => {
  const { response, events, source } = await harness();
  assert.equal(response.body.validation.review_status, 'not_requested');
  assert.equal(response.body.validation.pass, false);
  assert.equal(events.receipts.length, 1);
  const receipt = events.receipts[0];
  assert.equal(receipt.providerRequestId, 'image-request');
  assert.equal(receipt.metadata.extraction_flow, 'direct_crop');
  assert.equal(receipt.metadata.input_reference_sha256, createHash('sha256').update(source).digest('hex'));
  assert.deepEqual(receipt.metadata.provider_input, events.input);
});

test('a stale already-flat verdict cannot substitute the original crop for the actual generated image', async () => {
  const { response, events, source, output } = await harness();
  assert.equal(response.body.success, true); assert.ok(events.uploads[0].equals(output));
  assert.ok(!events.uploads[0].equals(source));
  assert.equal(response.body.validation.extraction_method, 'direct_crop_image_edit');
});

test('real provider failures still refund the verified charge and never save a source substitute', async () => {
  const { response, events } = await harness({ providerFails: true });
  assert.equal(response.body.success, false); assert.equal(response.body.refunded, true);
  assert.equal(events.generations, 1); assert.equal(events.refunds, 1); assert.equal(events.uploads.length, 0);
});
