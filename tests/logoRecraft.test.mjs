import test from 'node:test';
import assert from 'node:assert/strict';
import { recraftLogoPlan, recraftResult } from '../src/lib/logoRecraft.mjs';
import { nanoLogoPlan } from '../src/lib/logoFal.mjs';
import { generateRecraftLogo, validateLogoSvg } from '../src/lib/logoRecraftServer.js';
import { LOGO_STYLES, validateLogoOperation, logoReplacementText } from '../src/lib/logoStudio.mjs';
import sharp from 'sharp';

const input = changes => validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text', brand: 'FORMA', prompt: 'A mountain logo', ...changes });

test('every creation style uses Recraft V4.1 PNG, including exact controls-only lettering', () => {
  for (const style of LOGO_STYLES) {
    const plan = recraftLogoPlan(input({ style: style.id }));
    assert.equal(plan.model, 'recraftv4_1'); assert.equal(plan.endpoint, 'images/generations');
    assert.equal(plan.cost, 0.035); assert.equal(plan.body.n, 1);
    assert.equal(plan.body.size, '1024x1024'); assert.equal(plan.body.image_format, 'png');
    assert.equal(plan.body.image_url, undefined);
    assert.equal(plan.body.style, undefined); // V3-only parameter must not leak into V4.1.
  }
  const plan = recraftLogoPlan(input({ style: 'streetwear-lettering', prompt: '', designSettings: { streetwearLetters: 'script' } }));
  assert.match(plan.body.prompt, /FORMA/); assert.match(plan.body.prompt, /Chicano-inspired script/);
});

test('references use Recraft image-to-image with deliberate identity-preservation strengths', () => {
  for (const [changes, strength] of [[{ mode: 'image' }, .6], [{ mode: 'sketch' }, .6], [{ mode: 'sketch', sketchMode: 'precise' }, .3], [{ operation: 'variations' }, .45]]) {
    const request = { ...input({ ...changes, sourceId: crypto.randomUUID() }), compiledPrompt: 'Trusted compiled direction', seed: 42 };
    const plan = recraftLogoPlan(request, { image: 'data:image/png;base64,cG5n' });
    assert.equal(plan.endpoint, 'images/imageToImage'); assert.equal(plan.model, 'recraftv4_1');
    assert.equal(plan.body.strength, strength); assert.equal(plan.body.random_seed, 42);
    assert.equal(plan.body.prompt, request.compiledPrompt); assert.equal(plan.body.image_url, 'data:image/png;base64,cG5n');
    assert.equal(plan.body.size, undefined); assert.equal(plan.body.mask_url, undefined);
    assert.throws(() => recraftLogoPlan(request), /source image/);
  }
});

test('generation response uses data array, returned model and actual API units', () => {
  const plan = recraftLogoPlan(input());
  const result = recraftResult({ data: [{ url: 'https://img.recraft.ai/test.png', image_id: 'generated' }], credits: 35 }, plan);
  assert.equal(result.format, 'png'); assert.equal(result.model, 'recraftv4_1');
  assert.equal(result.cost, .035); assert.equal(result.providerRequestId, 'generated');
});

test('actual adapter sends compiled creation prompts and rasterizes SVG references for V4.1 variations', async () => {
  const previous = process.env.RECRAFT_API_TOKEN; process.env.RECRAFT_API_TOKEN = 'test-only';
  try {
    for (const operation of ['generate', 'variations']) {
      const result = await generateRecraftLogo({ ...input({ operation, sourceId: operation === 'variations' ? crypto.randomUUID() : undefined }), compiledPrompt: 'Make the primary fill blue', seed: 9 }, operation === 'variations' ? svg : undefined, operation === 'variations' ? 'svg' : undefined, {
        request: async (url, options) => {
          assert.equal(url, 'https://external.api.recraft.ai/v1/images/' + (operation === 'generate' ? 'generations' : 'imageToImage'));
          const body = JSON.parse(options.body);
          assert.equal(body.model, 'recraftv4_1'); assert.equal(body.prompt, 'Make the primary fill blue');
          if (operation === 'variations') {
            assert.match(body.image_url, /^data:image\/png;base64,/);
            const metadata = await sharp(Buffer.from(body.image_url.split(',')[1], 'base64')).metadata();
            assert.equal(metadata.width, 1024); assert.equal(metadata.height, 1024);
          }
          return { ok: true, headers: new Headers(), json: async () => ({ data: [{ url: 'https://img.recraft.ai/out.png' }], credits: 35 }) };
        },
      });
      assert.equal(result.model, 'recraftv4_1'); assert.equal(result.format, 'png');
    }
  } finally { if (previous === undefined) delete process.env.RECRAFT_API_TOKEN; else process.env.RECRAFT_API_TOKEN = previous; }
});

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="white"/></svg>');
test('actual V4.1 adapter prepares user inspiration as the sole native style source while preserving identity, colors and price', async () => {
  const previous = process.env.RECRAFT_API_TOKEN; process.env.RECRAFT_API_TOKEN = 'test-only';
  try {
    const styleReferenceBuffer = await sharp({ create: { width: 1400, height: 700, channels: 3, background: '#123456' } }).png().toBuffer();
    for (const styleMatch of ['flexible', 'precise']) {
      const request = { ...input({ generationOptions: { styleMatch }, styleReferenceUrl: 'https://storage.test/owned.png', designSettings: { primaryColor: '#123456' } }), seed: 0,
        visualGuidance: { version: 'logo-visual-guides-1', style: 'mascot', match: 'flexible' } };
      const result = await generateRecraftLogo(request, undefined, undefined, { styleReferenceBuffer, request: async (url, options) => {
        assert.equal(url, 'https://external.api.recraft.ai/v1/images/generations');
        const body = JSON.parse(options.body);
        assert.equal(body.model, 'recraftv4_1'); assert.equal(body.style_match, styleMatch); assert.equal(body.random_seed, 0); assert.equal(body.size, '1024x1024');
        assert.equal(body.style_reference_urls.length, 1); assert.deepEqual(body.controls.colors, [{ rgb: [18, 52, 86] }]);
        const info = await sharp(Buffer.from(body.style_reference_urls[0].split(',')[1], 'base64')).metadata();
        assert.equal(info.width, 768); assert.equal(info.height, 384);
        assert.match(body.prompt, /Do not copy its subject, composition, brand name/);
        assert.equal(body.image_url, undefined);
        return { ok: true, headers: new Headers(), json: async () => ({ data: [{ url: 'https://img.recraft.ai/result.png' }], credits: 40 }) };
      } });
      assert.equal(result.cost, .04); assert.equal(result.visualGuideResult.role, 'user-style-inspiration');
    }
    assert.throws(() => recraftLogoPlan(input({ styleReferenceUrl: 'https://storage.test/owned.png' })), /not prepared/);
  } finally { if (previous === undefined) delete process.env.RECRAFT_API_TOKEN; else process.env.RECRAFT_API_TOKEN = previous; }
});

test('Recraft tools retain native SVG backgrounds and vectorize raster images at the utility rate', () => {
  const vector = recraftLogoPlan({ operation: 'vectorize' }, { image: 'png' });
  assert.equal(vector.endpoint, 'images/vectorize'); assert.equal(vector.format, 'svg'); assert.equal(vector.cost, 0.01);
  assert.equal(recraftLogoPlan({ operation: 'removeBg', sourceFormat: 'svg' }, { image: 'svg' }).format, 'svg');
  assert.equal(recraftLogoPlan({ operation: 'removeBg', sourceFormat: 'png' }, { image: 'png' }).format, 'png');

});
test('Recraft utility responses retain image IDs and actual costs; empty results fail', () => {
  const plan = recraftLogoPlan({ operation: 'vectorize' }, { image: 'png' });
  const output = recraftResult({ image: { url: 'https://img.recraft.ai/logo.svg', image_id: 'output-id' }, credits: 10 }, plan);
  assert.equal(output.cost, 0.01); assert.equal(output.providerRequestId, 'output-id');
  assert.throws(() => recraftResult({}, plan), /no image/);
});
test('unsafe SVG is rejected before source rasterization', () => {
  validateLogoSvg(svg);
  for (const bad of ['<script>alert(1)</script>', '<image href="https://example.com/x"/>', '<path onload="bad()"/>']) assert.throws(() => validateLogoSvg(Buffer.from('<svg>'+bad+'</svg>')));
});
test('Recraft adapter preserves vector input for background removal without retrying failed requests', async () => {
  const previous = process.env.RECRAFT_API_TOKEN; process.env.RECRAFT_API_TOKEN = 'test-only';
  let calls = 0;
  try {
    const result = await generateRecraftLogo({ operation: 'removeBg' }, svg, 'svg', { request: async (url, options) => {
      calls++; assert.equal(url, 'https://external.api.recraft.ai/v1/images/removeBackground');
      assert.ok(JSON.parse(options.body).image_url.startsWith('data:image/svg+xml;base64,'));
      return { ok: true, headers: new Headers(), json: async () => ({ image: { url: 'https://img.recraft.ai/logo.svg' }, credits: 10 }) };
    } });
    assert.equal(result.format, 'svg'); assert.equal(result.cost, 0.01);
    calls = 0;
    await assert.rejects(generateRecraftLogo({ operation: 'removeBg' }, svg, 'svg', { request: async () => { calls++; return { ok: false, status: 429 }; } }), /429/);
    assert.equal(calls, 1);
  } finally { if (previous === undefined) delete process.env.RECRAFT_API_TOKEN; else process.env.RECRAFT_API_TOKEN = previous; }
});


test('AI Edit cannot fall back to Recraft generation or style reference synthesis', () => {
  for (const prompt of ['change the text, MANLY', 'change the text to MANLY', 'Make the outline blue']) {
    const request = input({ operation: 'edit', sourceId: crypto.randomUUID(), prompt });
    assert.throws(() => recraftLogoPlan(request, { image: 'reference' }), /Nano Banana 2\.1 image editing/);
  }
});

test('word replacement recognizes explicit targets and does not rename recolor or compound edits', () => {
  for (const [prompt, target] of [
    ['CHANGE THE WORD INTO GODS', 'GODS'], ['change the text to "GODS".', 'GODS'],
    ["Please replace the brand name with 'GODS & CO.'", 'GODS & CO.'],
    ['set the logo text to Night Shift', 'Night Shift'],
    ['change the text, MANLY', 'MANLY'], ['change the text: "MANLY"', 'MANLY'],
  ]) assert.equal(logoReplacementText(prompt), target);
  for (const prompt of ['Change the word color to gold', 'Remove the star', 'Make the word GODS smaller', 'Change the text to GODS and make it red', 'change the text to ']) assert.equal(logoReplacementText(prompt), null);
});


test('text generation passes assigned colors to Recraft native controls without constraining later recolor edits', () => {
  const request = input({ designSettings: { primaryColor: '#123456', secondaryColor: '#ABCDEF', outlineColor: '#102030', backgroundColor: '#F8F2E8' }, palette: ['#123456', '#abcdef'] });
  const plan = recraftLogoPlan(request);
  assert.deepEqual(plan.body.controls, { colors: [{ rgb: [18, 52, 86] }, { rgb: [171, 205, 239] }, { rgb: [16, 32, 48] }], background_color: { rgb: [248, 242, 232] } });
  assert.match(plan.body.prompt, /primary color: #123456/);
  assert.match(plan.body.prompt, /outline color: #102030/);
  assert.equal(nanoLogoPlan({ ...request, operation: 'edit', prompt: 'Make the primary color blue' }, 'reference').input.controls, undefined);
});
