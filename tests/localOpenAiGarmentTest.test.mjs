import test from 'node:test';
import assert from 'node:assert/strict';
import { isLocalOpenAiRequest, shouldUseLocalOpenAi, extractLocalOpenAi, localOpenAiCost, localOpenAiSettings, localOpenAiUniversalSize, localOpenAiConfig, validateLocalOpenAiInput } from '../src/lib/localOpenAiExtraction.mjs';
const dev = { NODE_ENV: 'development', LOCAL_OPENAI_GARMENT_TEST_ENABLED: 'true' };
const request = (url, host) => new Request(url, { headers: host ? { host } : {} });

test('OpenAI stays disabled without the production opt-in and for public or spoofed development hosts', () => {
  const local = request('http://localhost:3000/api/trace', 'localhost:3000');
  assert.equal(isLocalOpenAiRequest(local, dev), true);
  assert.equal(isLocalOpenAiRequest(local, { ...dev, NODE_ENV: 'production' }), false);
  assert.equal(isLocalOpenAiRequest(local, { NODE_ENV: 'development' }), false);
  assert.equal(isLocalOpenAiRequest(request('https://syncraftech.com/api/trace', 'syncraftech.com'), dev), false);
  assert.equal(isLocalOpenAiRequest(request('http://localhost:3000/api/trace', 'syncraftech.com'), dev), false);
  assert.equal(isLocalOpenAiRequest(request('http://localhost.attacker.test/api/trace'), dev), false);
});

test('production Vela requires the release flag, production environment and a trusted HTTPS host', () => {
  const production = { NODE_ENV: 'production', VERCEL_ENV: 'production', OPENAI_EXTRACTION_ENABLED: 'true',
    NEXT_PUBLIC_SITE_URL: 'https://syncraftech.com', VERCEL_URL: 'syncraft-release.vercel.app' };
  for (const host of ['syncraftech.com', 'www.syncraftech.com', 'syncraft-release.vercel.app']) {
    assert.equal(isLocalOpenAiRequest(request(`https://${host}/api/trace`, host), production), true);
  }
  const live = request('https://syncraftech.com/api/trace', 'syncraftech.com');
  assert.equal(isLocalOpenAiRequest(live, { ...production, OPENAI_EXTRACTION_ENABLED: 'false' }), false);
  assert.equal(isLocalOpenAiRequest(live, { ...production, VERCEL_ENV: 'preview' }), false);
  assert.equal(isLocalOpenAiRequest(request('http://syncraftech.com/api/trace'), production), false);
  assert.equal(isLocalOpenAiRequest(request('https://attacker.test/api/trace'), production), false);
  assert.equal(isLocalOpenAiRequest(request('https://syncraftech.com/api/trace', 'attacker.test'), production), false);
});

test('local switch supports only Garment, Logo and Universal Extraction', () => {
  const local = request('http://127.0.0.1:3000/api/trace', '127.0.0.1:3000');
  assert.equal(shouldUseLocalOpenAi(local, { trace_type: 'mockup' }, dev, 'openai'), true);
  for (const trace_type of ['logo', 'universal']) assert.equal(shouldUseLocalOpenAi(local, { trace_type }, dev, 'openai'), true);
  for (const trace_type of ['upscale', 'text-to-logo', undefined]) assert.equal(shouldUseLocalOpenAi(local, { trace_type }, dev, 'openai'), false);
});

test('actual workflow sends the original image and prompt in one 1K High OpenAI edit', async () => {
  const image = Buffer.from('unchanged original source');
  let calls = 0;
  const usage = { input_tokens_details: { text_tokens: 200, image_tokens: 1000 }, output_tokens: 1756 };
  const result = await extractLocalOpenAi({ apiKey: 'sk-placeholder-test-key', model: 'gpt-image-2.6-sunburst', image, mime: 'image/png', garmentMode: 'PRESERVE_LOGOS', projectId: 'unit-test', aspectRatio: '3:4', saveReport: false,
    fetchImpl: async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.openai.com/v1/images/edits');
      assert.equal(init.body.get('quality'), 'high');
      assert.equal(init.body.get('size'), '896x1200');
      assert.equal(init.body.get('n'), '1');
      assert.match(init.body.get('prompt'), /KEEP ALL PRINTED ARTWORK/);
      assert.match(init.body.get('prompt'), /buttons, buttonholes, polo placket/);
      assert.match(init.body.get('prompt'), /Remove photographed fabric weave/);
      assert.doesNotMatch(init.body.get('prompt'), /only a clearly identifiable collar|if shading is ambiguous/);
      assert.equal(init.body.get('complexity'), 'high');
      assert.equal(init.body.get('input_fidelity'), null);
      assert.match(init.body.get('prompt'), /896x1200/);
      assert.doesNotMatch(init.body.get('prompt'), /square/);
      assert.deepEqual(Buffer.from(await init.body.get('image[]').arrayBuffer()), image);
      return Response.json({ data: [{ b64_json: image.toString('base64') }], usage }, { headers: { 'x-request-id': 'test-request' } });
    } });
  assert.equal(calls, 1);
  assert.deepEqual(result.buffer, image);
  assert.deepEqual(result.report.usage, usage);
  assert.equal(result.report.estimatedCostUsd, 0.06168);
  assert.ok(!JSON.stringify(result.report).includes('sk-placeholder'));
});

test('failed OpenAI calls are not retried and never expose the raw key-bearing response', async () => {
  let calls = 0;
  const secret = 'sk-placeholder-test-key';
  await assert.rejects(extractLocalOpenAi({ apiKey: secret, model: 'gpt-image-2.5-sunburst', image: Buffer.from('image'), mime: 'image/png', prompt: 'prompt', systemPrompt: 'system', saveReport: false,
    fetchImpl: async () => { calls++; return Response.json({ error: { message: `Invalid key ${secret}` } }, { status: 401 }); } }), error => error.message.includes('rejected the configured API key') && !error.message.includes(secret));
  assert.equal(calls, 1);
  assert.equal(localOpenAiCost({}), null);
});

// Exercise the actual trace handler with mocked storage/billing, never real accounts or API spend.
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import sharp from 'sharp';
import * as resolutionPolicy from '../src/lib/extractionResolution.mjs';
import * as garmentPrompts from '../src/lib/garmentPromptRules.mjs';

async function routeHarness({ apiKey = '', resolution = '1K', failProvider = false, aspectRatio = '1:1', wrongSize = false, traceType = 'mockup', available = true, sourceFormat = 'png' } = {}) {
  const image = await sharp({ create: { width: 1024, height: 1024, channels: 3, background: '#111111' } }).toFormat(sourceFormat).toBuffer();
  const [outputWidth, outputHeight] = localOpenAiSettings(aspectRatio, 'gpt-image-2.5-sunburst', ['1K', '2K', '4K'].includes(resolution) ? resolution : '1K').size.split('x').map(Number);
  const outputImage = wrongSize ? image : await sharp({ create: { width: outputWidth, height: outputHeight, channels: 3, background: '#111111' } }).png().toBuffer();
  const calls = { charge: 0, source: 0, openai: 0, fal: 0, upload: 0, refund: 0, receipts: [], amounts: [] };
  const project = { id: 'project', user_id: 'owner', trace_type: traceType, original_image_url: 'https://storage.test/users/owner/ref.png', canvas_data: { garment_mode: 'ERASE_LOGOS' } };
  const text = (await readFile(new URL('../src/app/api/trace/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/export /g, '').replace(/\bimport\(/g, '__import(');
  const context = vm.createContext({ ...resolutionPolicy, ...garmentPrompts, Buffer, AbortSignal, URL, localOpenAiSettings, NextResponse: Response,
    process: { env: { ...dev, LOCAL_OPENAI_GARMENT_TEST_ENABLED: available ? 'true' : 'false', OPENAI_API_KEY: apiKey, LOCAL_GARMENT_OPENAI_MODEL: 'gpt-image-2.5-sunburst' } }, console: { log() {}, warn() {}, error() {} },
    getLocalOpenAiConfig: localOpenAiConfig, validateLocalOpenAiInput,
    shouldUseLocalOpenAi: (req, item, _env, selected) => shouldUseLocalOpenAi(req, item, dev, selected), readLocalOpenAiKey: async () => apiKey, localOpenAiModel: () => 'gpt-image-2.5-sunburst',
    __import: async name => name === 'sharp' ? { default: sharp } : (calls.fal++, Promise.reject(new Error('Unexpected Nano Banana import'))),
    extractLocalOpenAi: async args => {
      calls.openai++;
      assert.equal(args.aspectRatio, aspectRatio);
      assert.equal(args.resolution, resolution);
      assert.equal(args.image, image);
      assert.equal(args.traceType, traceType);
      assert.equal(args.garmentMode, traceType === 'logo' ? 'PRESERVE_LOGOS' : 'ERASE_LOGOS');
      assert.equal(args.prompt, undefined);
      assert.equal(args.systemPrompt, undefined);
      assert.deepEqual({ ...args.sourceDimensions }, { width: 1024, height: 1024 });
      if (failProvider) throw new Error('OpenAI rejected the configured API key.');
      return { buffer: outputImage, report: { model: args.model, requestId: 'mock-request', estimatedCostUsd: 0.06, usage: { output_tokens: 1756 } } };
    },
    universalUnavailableResponse: () => null, PROJECT_ACCESS: { EDIT: 'edit' }, CREDIT_COST: { trace: 12 },
    adminSupabase: { auth: { getUser: async () => ({ data: { user: { id: 'owner' } } }) }, from: () => ({ update: () => ({ eq: async () => ({ error: null }) }) }) },
    getProjectAccess: async () => ({ project }), enforceRateLimit: async () => ({ success: true }),
    normalizeUserImageUrl: url => url, isOwnedStorageUrl: () => true, validateUrlForSSRF: async () => true, getAllowedStorageHosts: () => [], DEFAULT_MAX_IMAGE_BYTES: 15 * 1024 * 1024,
    fetchStoredAsset: async () => { calls.source++; return { response: { ok: true }, buffer: image, finalUrl: project.original_image_url }; },
    chargeCreditsVerified: async input => { calls.charge++; calls.amounts.push(input.amount); return { transactionId: 'charge', balanceAfter: 100 - input.amount, isOwnerTest: false }; },
    recordProviderUsage: async receipt => { calls.receipts.push(receipt); }, markCreditTransaction: async () => {}, findLatestProjectCharge: async () => null,
    refundCreditVerified: async () => { calls.refund++; return { refunded: true, balanceAfter: 100 }; },
    garmentExtractionMode: () => 'enhanced', shouldSaveGarmentExtractionServerSide: () => true, snapToAllowedAspectRatio: () => aspectRatio,
    uploadToR2: async buffer => { assert.deepEqual(buffer, outputImage); calls.upload++; return 'https://storage.test/generated.png'; },
  });
  const post = vm.runInContext(`${text}\nPOST`, context);
  const response = await post(new Request('http://localhost:3000/api/trace', { method: 'POST', headers: { host: 'localhost:3000', authorization: 'Bearer test-session', 'content-type': 'application/json' }, body: JSON.stringify({ projectId: 'project', step: 1, resolution, garmentProvider: 'openai' }) }));
  return { status: response.status, body: await response.json(), calls };
}

test('actual route rejects missing OpenAI key before source reads or credit charges', async () => {
  const result = await routeHarness();
  assert.equal(result.status, 503);
  assert.equal(result.body.code, 'LOCAL_OPENAI_KEY_REQUIRED');
  assert.deepEqual([result.calls.source, result.calls.charge, result.calls.openai, result.calls.fal, result.calls.refund], [0, 0, 0, 0, 0]);
});

test('an unavailable Vela selection cannot charge Nano Banana, and unsupported sources stop before billing', async () => {
  for (const options of [{ available: false }, { sourceFormat: 'gif' }]) {
    const result = await routeHarness({ apiKey: 'test-key', ...options });
    assert.equal(result.status, options.available === false ? 503 : 415);
    assert.deepEqual([result.calls.charge, result.calls.openai, result.calls.fal, result.calls.refund], [0, 0, 0, 0]);
  }
});

test('actual route rejects unsupported test resolution before charges or model work', async () => {
  const result = await routeHarness({ apiKey: 'test-key', resolution: '8K' });
  assert.equal(result.status, 400);
  assert.equal(result.calls.charge, 0);
  assert.equal(result.calls.openai, 0);
  assert.equal(result.calls.fal, 0);
});

test('actual local garment route makes one OpenAI edit, retains the existing save and billing flow', async () => {
  const result = await routeHarness({ apiKey: 'test-key' });
  assert.equal(result.status, 200);
  assert.equal(result.calls.openai, 1);
  assert.equal(result.calls.fal, 0);
  assert.equal(result.calls.charge, 1);
  assert.equal(result.calls.upload, 1);
  assert.equal(result.body.alreadySaved, true);
  assert.equal(result.body.localOpenAiTest.estimatedCostUsd, 0.06);
  assert.equal(result.calls.receipts[0].provider, 'openai');
});

test('OpenAI failure uses the existing linked refund without a Nano Banana retry', async () => {
  const result = await routeHarness({ apiKey: 'test-key', failProvider: true });
  assert.equal(result.status, 500);
  assert.equal(result.calls.charge, 1);
  assert.equal(result.calls.refund, 1);
  assert.equal(result.calls.openai, 1);
  assert.equal(result.calls.fal, 0);
  assert.equal(result.calls.upload, 0);
});


test('Nano Banana remains the default even when OpenAI testing is enabled', () => {
  const local = request('http://localhost:3000/api/trace', 'localhost:3000');
  assert.equal(shouldUseLocalOpenAi(local, { trace_type: 'mockup' }, dev), false);
  assert.equal(shouldUseLocalOpenAi(local, { trace_type: 'mockup' }, dev, 'nano-banana'), false);
});

import { readLocalOpenAiKey } from '../src/lib/localOpenAiExtraction.mjs';
test('OpenAI key configuration comes only from server environment', async () => {
  assert.equal(await readLocalOpenAiKey({}), '');
  assert.equal(await readLocalOpenAiKey({ OPENAI_API_KEY: ' server-test-secret ' }), 'server-test-secret');
});

test('capability discovery cannot accept API credentials and the key panel is removed', async () => {
  const route = await readFile(new URL('../src/app/api/local-garment-test/route.js', import.meta.url), 'utf8');
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function POST|saveLocalOpenAiKey|apiKey/);
  const layout = await readFile(new URL('../src/app/workspace/layout.js', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /LocalGarmentTestControl/);
});


test('portrait and landscape canvases match the existing 1K reference policy and OpenAI limits', () => {
  for (const ratio of ['1:1','2:3','3:2','3:4','4:3','4:5','5:4','9:16','16:9','21:9']) {
    const [width,height] = localOpenAiSettings(ratio).size.split('x').map(Number);
    assert.equal(width % 16, 0); assert.equal(height % 16, 0);
    assert.ok(width * height >= 655360 && width * height <= 8294400);
    assert.ok(Math.abs(width / height - ratio.split(':').reduce((a,b) => a/b)) < 0.03);
  }
  assert.equal(localOpenAiSettings('3:4').size, '896x1200');
  assert.equal(localOpenAiSettings('4:3').size, '1200x896');
  assert.throws(() => localOpenAiSettings('arbitrary'), /Unsupported/);
});

test('actual route accepts a native portrait result and rejects square output for a portrait request', async () => {
  const portrait = await routeHarness({ apiKey: 'test-key', aspectRatio: '3:4' });
  assert.equal(portrait.status, 200); assert.equal(portrait.calls.upload, 1);
  const square = await routeHarness({ apiKey: 'test-key', aspectRatio: '3:4', wrongSize: true });
  assert.equal(square.status, 500); assert.equal(square.calls.upload, 0);
  assert.equal(square.calls.refund, 1); assert.equal(square.calls.openai, 1);
});


import { buildLocalOpenAiGarmentPrompt, LOCAL_OPENAI_GARMENT_PROMPT_VERSION } from '../src/lib/localOpenAiGarmentPrompt.mjs';
test('both OpenAI content modes remove physical garment construction without erasing printed texture', () => {
  for (const garmentMode of ['ERASE_LOGOS', 'PRESERVE_LOGOS']) {
    const prompt = buildLocalOpenAiGarmentPrompt({ garmentMode, size: '768x1376' });
    assert.match(prompt, /physical construction even when it has the same color or gradient/);
    assert.match(prompt, /Keep intentional PRINTED textures, halftones, gradients/);
    assert.match(prompt, /Do not retain or redraw any button, hole, stitch, rectangular placket border/);
    assert.match(prompt, /768x1376/);
    assert.doesNotMatch(prompt, /only a clearly identifiable collar|if shading is ambiguous/);
    assert.equal(prompt.includes('KEEP ALL PRINTED ARTWORK'), garmentMode === 'PRESERVE_LOGOS');
    assert.equal(prompt.includes('EXTRACT PATTERN ONLY'), garmentMode === 'ERASE_LOGOS');
  }
});

test('OpenAI sends the saved removal mode and excludes full prompt diagnostics from its client report', async () => {
  const result = await extractLocalOpenAi({ apiKey: 'test-key', model: 'gpt-image-2.6-sunburst', image: Buffer.from('reference'), mime: 'image/jpeg', garmentMode: 'ERASE_LOGOS', aspectRatio: '9:16', saveReport: false,
    fetchImpl: async (_url, init) => {
      const prompt = init.body.get('prompt');
      assert.match(prompt, /EXTRACT PATTERN ONLY/); assert.doesNotMatch(prompt, /KEEP ALL PRINTED ARTWORK/);
      assert.equal(init.body.get('size'), '768x1376'); assert.equal(init.body.get('quality'), 'high');
      return Response.json({data:[{b64_json:Buffer.from('result').toString('base64')}]});
    } });
  assert.equal(result.report.garmentMode, 'ERASE_LOGOS');
  assert.equal(result.report.promptVersion, LOCAL_OPENAI_GARMENT_PROMPT_VERSION);
  assert.equal(result.report.diagnostics, undefined); assert.equal(result.report.prompt, undefined);
});

test('invalid OpenAI content mode stops before any provider request', async () => {
  let called=false;
  await assert.rejects(extractLocalOpenAi({ apiKey:'test-key',model:'gpt-image-2.6-sunburst',image:Buffer.from('image'),mime:'image/png',garmentMode:'unknown',saveReport:false,fetchImpl:async()=>{called=true;} }), /Unsupported OpenAI garment content mode/);
  assert.equal(called,false);
});


test('2.5 image requests omit the 2.6-only complexity control', async () => {
  for (const model of ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare']) {
    assert.equal(localOpenAiSettings('9:16', model).complexity, undefined);
    await extractLocalOpenAi({ apiKey:'test-key',model,image:Buffer.from('reference'),mime:'image/jpeg',garmentMode:'PRESERVE_LOGOS',aspectRatio:'9:16',saveReport:false,fetchImpl:async(_url,init)=>{
      assert.equal(init.body.get('complexity'),null);assert.equal(init.body.get('quality'),'high');assert.equal(init.body.get('size'),'768x1376');
      return Response.json({data:[{b64_json:Buffer.from('result').toString('base64')}]});
    } });
  }
});


test('both content modes retain the observed palette while removing only local fold lighting', () => {
  for (const garmentMode of ['ERASE_LOGOS', 'PRESERVE_LOGOS']) {
    const prompt=buildLocalOpenAiGarmentPrompt({garmentMode,size:'768x1376'});
    assert.match(prompt,/representative visible mid-tone/);
    assert.match(prompt,/never substitute bright yellow/);
    assert.ok(prompt.includes('ivory/cream/beige'));
    assert.match(prompt,/rather than crushing it to pure black/);
    assert.ok(prompt.includes('only inside clearly identifiable local fold shadows/highlights'));
    assert.match(prompt,/Keep printed gradients, their endpoints, tonal range/);
    assert.match(prompt,/conditional preservation rules/);
  }
});

test('all Vela resolution tiers preserve aspect ratio within the provider pixel and edge limits', () => {
  for (const ratio of ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']) {
    const [x, y] = ratio.split(':').map(Number);
    let previousPixels = 0;
    for (const resolution of ['1K', '2K', '4K']) {
      const settings = localOpenAiSettings(ratio, 'gpt-image-2.6-sunburst', resolution);
      const [width, height] = settings.size.split('x').map(Number);
      assert.equal(width % 16, 0); assert.equal(height % 16, 0);
      assert.ok(Math.max(width, height) <= 3840);
      assert.ok(width * height <= 8_294_400 && width * height >= 655_360);
      assert.ok(width * height > previousPixels);
      assert.ok(Math.abs((width / height) / (x / y) - 1) < 0.02);
      assert.equal(settings.quality, 'high'); assert.equal(settings.n, 1);
      previousPixels = width * height;
    }
  }
  assert.equal(localOpenAiSettings('9:16', undefined, '2K').size, '1536x2752');
  assert.equal(localOpenAiSettings('9:16', undefined, '4K').size, '2160x3840');
  assert.equal(localOpenAiSettings('16:9', undefined, '4K').size, '3840x2160');
  assert.throws(() => localOpenAiSettings('9:16', undefined, '8K'), /Unsupported/);
});

test('Vela 2K and 4K send one native edit with the matching size, quality, prompt, and report', async () => {
  for (const [resolution, size] of [['2K', '1536x2752'], ['4K', '2160x3840']]) {
    let requests = 0;
    const result = await extractLocalOpenAi({ apiKey: 'test-key', model: 'gpt-image-2.6-sunburst', image: Buffer.from('reference'), mime: 'image/png', aspectRatio: '9:16', resolution, saveReport: false,
      fetchImpl: async (_url, init) => {
        requests++;
        assert.equal(init.body.get('size'), size); assert.equal(init.body.get('quality'), 'high');
        assert.equal(init.body.get('complexity'), 'high'); assert.equal(init.body.get('n'), '1');
        assert.ok(init.body.get('prompt').includes(size));
        return Response.json({ data: [{ b64_json: Buffer.from('native-image').toString('base64') }] });
      },
    });
    assert.equal(requests, 1); assert.equal(result.report.resolution, resolution);
    assert.equal(result.report.settings.size, size); assert.equal(result.buffer.toString(), 'native-image');
  }
});

test('Vela 2K and 4K use the existing server credit tiers and save the native image once', async () => {
  for (const [resolution, amount, size] of [['2K', 16, '1536x2752'], ['4K', 24, '2160x3840']]) {
    const result = await routeHarness({ apiKey: 'test-key', resolution, aspectRatio: '9:16' });
    assert.equal(result.status, 200); assert.deepEqual(result.calls.amounts, [amount]);
    assert.equal(result.body.balanceAfter, 100 - amount); assert.equal(result.body.creditsCharged, amount);
    assert.equal(result.body.resolution, resolution); assert.equal(result.calls.openai, 1);
    assert.equal(result.calls.fal, 0); assert.equal(result.calls.upload, 1); assert.equal(result.calls.refund, 0);
    assert.equal(result.calls.receipts[0].metadata.resolution, resolution);
    assert.equal(result.calls.receipts[0].metadata.outputSize, size);
  }
});

test('a smaller result on a paid Vela 2K or 4K request is never relabeled/upscaled or retried', async () => {
  for (const [resolution, amount] of [['2K', 16], ['4K', 24]]) {
    const result = await routeHarness({ apiKey: 'test-key', resolution, aspectRatio: '9:16', wrongSize: true });
    assert.equal(result.status, 500); assert.deepEqual(result.calls.amounts, [amount]);
    assert.equal(result.calls.upload, 0); assert.equal(result.calls.refund, 1);
    assert.equal(result.calls.openai, 1); assert.equal(result.calls.fal, 0);
    const providerReceipts = result.calls.receipts.filter(receipt => receipt.provider === 'openai');
    assert.equal(providerReceipts.length, 1);
    assert.equal(providerReceipts[0].providerRequestId, 'mock-request');
    assert.equal(result.calls.receipts.some(receipt => receipt.provider === 'syncraft_pipeline' && receipt.requestStatus === 'failed'), true);
  }
});

test('Logo Extraction selects Vela at every resolution with one charge and native save', async () => {
  for (const resolution of ['1K', '2K', '4K']) {
    const result = await routeHarness({ apiKey: 'test-key', traceType: 'logo', resolution });
    assert.equal(result.status, 200);
    assert.deepEqual([result.calls.openai, result.calls.fal, result.calls.upload, result.calls.refund], [1, 0, 1, 0]);
    assert.deepEqual(result.calls.amounts, [resolutionPolicy.extractionCredits(resolution)]);
  }
});

test('Vela Logo uses its own preservation prompt rather than a garment or pattern-removal prompt', async () => {
  let prompt;
  const result = await extractLocalOpenAi({ apiKey: 'test-only', model: 'gpt-image-2.6-sunburst', traceType: 'logo',
    image: Buffer.from('original-logo'), mime: 'image/png', saveReport: false,
    fetchImpl: async (_url, init) => { prompt = init.body.get('prompt');
      assert.equal(init.body.get('image[]').size, 13);
      return Response.json({ data: [{ b64_json: Buffer.from('logo-output').toString('base64') }] }); } });
  assert.match(prompt, /existing logo/); assert.match(prompt, /every visible letter/);
  assert.doesNotMatch(prompt, /EXTRACT PATTERN ONLY|Remove the collar|main torso/);
  assert.equal(result.report.traceType, 'logo'); assert.equal(result.report.garmentMode, undefined);
});

test('Universal Vela canvases follow the exact crop proportions within API limits at every tier', () => {
  for (const [width, height] of [[1, 3], [3, 1], [367, 494], [1920, 1080], [1000, 1000]]) {
    let lastPixels = 0;
    for (const resolution of ['1K', '2K', '4K']) {
      const [w, h] = localOpenAiUniversalSize({ width, height }, resolution).split('x').map(Number);
      assert.ok(w % 16 === 0 && h % 16 === 0 && Math.max(w, h) <= 3840);
      assert.ok(w / h >= 1 / 3 && w / h <= 3);
      assert.ok(w * h >= 655360 && w * h <= 8294400 && w * h > lastPixels);
      assert.ok(Math.abs((w / h) / (width / height) - 1) < 0.03);
      lastPixels = w * h;
    }
  }
  for (const dimensions of [{ width: 1, height: 8 }, { width: 8, height: 1 }, { width: 0, height: 1 }])
    assert.throws(() => localOpenAiUniversalSize(dimensions), { code: 'VELA_CROP_RATIO_UNSUPPORTED' });
});
