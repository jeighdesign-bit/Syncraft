import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import * as resolutionPolicy from '../src/lib/extractionResolution.mjs';
import { universalUnavailableResponse } from '../src/lib/universalAvailability.mjs';
import { getAllowedStorageHosts, isOwnedStorageUrl, normalizeUserImageUrl, validateUrlForSSRF } from '../src/lib/ssrf.js';
import { buildGarmentExtractionInput, garmentExtractionMode, shouldSaveGarmentExtractionServerSide } from '../src/lib/garmentExtractionConfig.mjs';
import { buildGarmentExtractionPrompt, buildGarmentExtractionSystemPrompt, resolveGarmentPromptMode } from '../src/lib/garmentPromptRules.mjs';
import { ARTWORK_GENERATION_MODEL, buildArtworkGenerationInput } from '../src/lib/falArtworkGeneration.mjs';
import { snapToAllowedAspectRatio } from '../src/lib/aspectRatio.js';

process.env.CLOUDFLARE_PUBLIC_URL = 'https://storage.test';
async function harness({ enabled = false, garmentMode = 'PRESERVE_LOGOS', traceType = 'mockup', resolution, output4K = false, credits = 100, bodyExtras = {}, downloadError } = {}) {
  const raw = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="384" height="512"><rect width="384" height="512" fill="#7236a8"/><text x="50" y="180" font-size="70" fill="white">PRINT</text><path d="M20 250 L350 470" stroke="#ffaaff" stroke-width="16"/><circle cx="100" cy="390" r="40" stroke="white" stroke-width="12" fill="none"/></svg>')).png().toBuffer();
  const generated = output4K ? await sharp({ create: { width: 4096, height: 4096, channels: 3, background: '#7236a8' } }).png().toBuffer() : raw;
  const calls = { charges: 0, refunds: 0, provider: [], usage: [], downloads: [], uploads: [], chargeInputs: [], refundInputs: [] };
  const project = { id: 'project', user_id: 'owner', trace_type: traceType, ai_prompt: traceType === 'logo' ? 'LOGO_FLATTEN' : null, original_image_url: 'https://storage.test/users/owner/crop.jpg', canvas_data: { garment_mode: garmentMode } };
  const fal = { subscribe: async (endpoint, request) => {
    calls.provider.push({ endpoint, input: request.input });
    if (calls.provider.length > 1) throw new Error('The restored live prompt flow must not run a second image edit');
    return { requestId: calls.provider.length === 1 ? 'primary-request' : 'cleanup-request', data: { images: [{ url: calls.provider.length === 1 ? 'https://fal.media/primary.png' : 'https://fal.media/cleaned.png', content_type: 'image/png' }] } };
  } };
  const source = (await readFile(new URL('../src/app/api/trace/route.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '').replace(/\bimport\(/g, '__import(');
  const context = vm.createContext({ ...resolutionPolicy, Buffer, AbortSignal, URL, process: { env: { FAL_KEY: 'configured', GARMENT_FLAT_CLEANUP_ENABLED: enabled ? 'true' : 'false', GARMENT_EXTRACTION_PROMPT_VERSION: 'reconstruction-v10' } },
    console: { log() {}, warn() {}, error() {} }, NextResponse: Response,
    __import: async name => name === 'sharp' ? { default: sharp } : name === '@fal-ai/client' ? { fal } : Promise.reject(new Error('Unexpected import')),
    universalUnavailableResponse, PROJECT_ACCESS: { EDIT: 'edit' }, CREDIT_COST: { trace: 12 },
    adminSupabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
    enforceRateLimit: async () => ({ success: true }), getProjectAccess: async () => ({ project }),
    getAllowedStorageHosts, isOwnedStorageUrl, normalizeUserImageUrl, validateUrlForSSRF,
    getAllowedProviderHosts: () => ['fal.media'], DEFAULT_MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    fetchStoredAsset: async () => ({ response: { ok: true }, buffer: raw, finalUrl: project.original_image_url }),
    fetchWithSSRFProtection: async (url, options) => { calls.downloads.push({ url, options }); if (downloadError) throw downloadError; return { response: { ok: true }, buffer: generated }; },
    uploadToR2: async (buffer, path, mimeType) => { calls.uploads.push({ buffer, path, mimeType }); return `https://storage.test/${path}`; },
    chargeCreditsVerified: async input => { calls.charges++; calls.chargeInputs.push(input); if (credits < input.amount) throw Object.assign(new Error('INSUFFICIENT_CREDITS'), { code: 'INSUFFICIENT_CREDITS', balance: credits }); return { transactionId: 'charge', isOwnerTest: false, balanceAfter: credits - input.amount }; },
    markCreditTransaction: async () => {}, recordProviderUsage: async receipt => { calls.usage.push(receipt); },
    refundCreditVerified: async input => { calls.refunds++; calls.refundInputs.push(input); return { refunded: true, balanceAfter: 100 }; }, findLatestProjectCharge: async () => null,
    snapToAllowedAspectRatio, buildGarmentExtractionInput, garmentExtractionMode, shouldSaveGarmentExtractionServerSide,
    ARTWORK_GENERATION_MODEL, buildArtworkGenerationInput, buildGarmentExtractionPrompt, buildGarmentExtractionSystemPrompt, resolveGarmentPromptMode,
  });
  const post = vm.runInContext(`${source}\nPOST`, context);
  const response = await post(new Request('https://app.test/api/trace', { method: 'POST', headers: { authorization: 'Bearer session', 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'project', step: 1, ...(resolution !== undefined ? { resolution } : {}), ...bodyExtras }) }));
  return { calls, raw, status: response.status, body: await response.json() };
}

test('default garment extraction makes one provider request and no cleanup attempt', async () => {
  const h = await harness();
  assert.equal(h.status, 200);
  assert.equal(h.calls.provider.length, 1);
  assert.equal(h.calls.charges, 1);
  assert.equal(h.calls.chargeInputs[0].amount, 12);
  assert.equal(h.body.creditsCharged, 12);
  assert.equal(h.body.flatCleanup, undefined);
  assert.equal(h.calls.provider[0].input.resolution, '1K');
  assert.equal(h.body.alreadySaved, true);
  assert.equal(h.body.base64, undefined);
  assert.match(h.body.fileUrl, /generated_flat_/);
  assert.deepEqual(h.calls.uploads[0].buffer, h.raw);
  assert.equal(h.calls.downloads[0].options.timeoutMs, 10_000);
  assert.equal(h.calls.downloads[0].options.maxAttempts, 2);
});

test('4K garment and logo requests buy native 4K once for 24 credits, ignoring client price fields', async () => {
  for (const traceType of ['mockup', 'logo']) {
    const h = await harness({ traceType, resolution: '4K', output4K: true, bodyExtras: { credits: 12, cost: 0, amount: 1 } });
    assert.equal(h.status, 200); assert.equal(h.calls.provider.length, 1);
    assert.equal(h.calls.provider[0].input.resolution, '4K');
    assert.equal(h.calls.chargeInputs[0].amount, 24);
    assert.equal(h.calls.chargeInputs[0].metadata.resolution, '4K');
    assert.equal(h.body.creditsCharged, 24); assert.equal(h.body.resolution, '4K'); assert.equal(h.body.balanceAfter, 76);
    assert.equal(h.body.alreadySaved, true); assert.equal(h.body.base64, undefined);
    assert.equal((await sharp(h.calls.uploads[0].buffer).metadata()).width, 4096);
    assert.equal(h.calls.downloads[0].options.maxBytes, resolutionPolicy.MAX_NATIVE_4K_BYTES);
    assert.equal(h.calls.downloads[0].options.timeoutMs, 60_000);
    assert.equal(h.calls.downloads[0].options.maxAttempts, 2);
  }
});

test('an exhausted 4K download timeout explains the transfer failure and refunds 24 without generating again', async () => {
  const h = await harness({ resolution: '4K', downloadError: Object.assign(new Error('Remote file download timed out'), { name: 'TimeoutError' }) });
  assert.equal(h.status, 503);
  assert.equal(h.body.code, 'EXTRACTION_DOWNLOAD_TIMEOUT');
  assert.match(h.body.error, /artwork was generated.*image download timed out.*refunded/);
  assert.equal(h.calls.provider.length, 1);
  assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.calls.refunds, 1);
  assert.equal(h.calls.refundInputs[0].chargeTransactionId, 'charge');
  assert.equal(h.body.refundedCredits, 24);
  assert.equal(h.body.balance, 100);
});

test('invalid resolutions stop before source reads, billing, storage or provider work', async () => {
  for (const resolution of ['8K', '4k', '', null, 4096, {}]) {
    const h = await harness({ resolution });
    assert.equal(h.status, 400); assert.equal(h.body.code, 'INVALID_EXTRACTION_RESOLUTION');
    assert.equal(h.calls.charges, 0); assert.equal(h.calls.provider.length, 0); assert.equal(h.calls.uploads.length, 0);
  }
});

test('23 remaining credits cannot buy 4K and the server preserves the actual balance', async () => {
  const h = await harness({ resolution: '4K', credits: 23 });
  assert.equal(h.status, 403); assert.equal(h.body.balance, 23);
  assert.equal(h.calls.chargeInputs[0].amount, 24); assert.equal(h.calls.provider.length, 0); assert.equal(h.calls.refunds, 0);
});

test('a 4K request returning a lower-resolution image is discarded and its full linked charge refunded', async () => {
  const h = await harness({ resolution: '4K' });
  assert.equal(h.status, 500); assert.equal(h.body.code, 'EXTRACTION_RESOLUTION_MISMATCH');
  assert.equal(h.calls.provider.length, 1); assert.equal(h.calls.uploads.length, 0);
  assert.equal(h.calls.chargeInputs[0].amount, 24); assert.equal(h.calls.refundInputs[0].chargeTransactionId, 'charge');
  assert.equal(h.body.refundedCredits, 24); assert.equal(h.body.balance, 100);
});

test('exactly 24 credits buys native 4K for garment and logo', async () => {
  for (const traceType of ['mockup', 'logo']) {
    const h = await harness({ traceType, resolution: '4K', output4K: true, credits: 24 });
    assert.equal(h.status, 200); assert.equal(h.body.balanceAfter, 0);
    assert.equal(h.body.creditsCharged, 24); assert.equal(h.calls.charges, 1);
    assert.equal(h.calls.provider.length, 1);
  }
});

test('retired cleanup flags cannot enable another prompt pass or alter the saved live-prompt result', async () => {
  const h = await harness({ enabled: true });
  assert.equal(h.status, 200);
  assert.equal(h.calls.provider.length, 1);
  assert.equal(h.calls.charges, 1);
  assert.equal(h.calls.refunds, 0);
  assert.equal(h.calls.provider[0].input.resolution, '1K');
  assert.equal(h.body.flatCleanup, undefined);
  assert.equal(h.calls.usage.length, 1);
  assert.deepEqual(h.calls.uploads[0].buffer, h.raw);
});

test('Logo Extraction defaults to 1K and saves the original result server-side before responding', async () => {
  const h = await harness({ traceType: 'logo' });
  assert.equal(h.status, 200);
  assert.equal(h.calls.provider.length, 1);
  assert.equal(h.calls.provider[0].input.resolution, '1K');
  assert.match(h.calls.provider[0].input.prompt, /LOGO REPRODUCTION/);
  assert.equal(h.calls.chargeInputs[0].amount, 12);
  assert.equal(h.body.creditsCharged, 12);
  assert.equal(h.body.alreadySaved, true);
  assert.equal(h.body.base64, undefined);
  assert.deepEqual(h.calls.uploads[0].buffer, h.raw);
  assert.equal(h.calls.charges, 1);
});

test('both garment content modes use the restored live prompts with the approved 1K, 2K and 4K options', async () => {
  for (const garmentMode of ['PRESERVE_LOGOS', 'ERASE_LOGOS']) {
    for (const resolution of ['1K', '2K', '4K']) {
      const h = await harness({ enabled: true, garmentMode, resolution, output4K: resolution === '4K' });
      assert.equal(h.status, 200);
      assert.equal(h.calls.provider.length, 1);
      assert.equal(h.calls.provider[0].input.prompt, buildGarmentExtractionPrompt(garmentMode));
      assert.equal(h.calls.provider[0].input.system_prompt, buildGarmentExtractionSystemPrompt());
      assert.equal(h.calls.provider[0].input.resolution, resolution);
      assert.equal(h.calls.chargeInputs[0].amount, ({ '1K': 12, '2K': 16, '4K': 24 })[resolution]);
      assert.equal(h.calls.charges, 1);
      assert.equal(h.calls.refunds, 0);
    }
  }
});

test('every tier refunds exactly its server-selected charge after an output transfer failure', async () => {
  for (const [resolution, amount] of [['1K', 12], ['2K', 16], ['4K', 24]]) {
    const h = await harness({ resolution, bodyExtras: { amount: 1, credits: 1 }, downloadError: Object.assign(new Error('Remote file download timed out'), { name: 'TimeoutError' }) });
    assert.equal(h.status, 503);
    assert.equal(h.calls.chargeInputs[0].amount, amount);
    assert.equal(h.body.refundedCredits, amount);
    assert.equal(h.body.balance, 100);
    assert.equal(h.calls.provider.length, 1);
    assert.equal(h.calls.refunds, 1);
    assert.equal(h.calls.uploads.length, 0);
  }
});

test('2K requires exactly 16 credits and cannot accept a client-supplied lower price', async () => {
  const denied = await harness({ resolution: '2K', credits: 15, bodyExtras: { credits: 12, amount: 12 } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.balance, 15);
  assert.equal(denied.calls.provider.length, 0);
  const accepted = await harness({ resolution: '2K', credits: 16, bodyExtras: { credits: 12, amount: 12 } });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.creditsCharged, 16);
  assert.equal(accepted.body.balanceAfter, 0);
  assert.equal(accepted.calls.provider[0].input.resolution, '2K');
});
