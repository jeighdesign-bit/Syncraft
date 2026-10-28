import test from 'node:test';
import assert from 'node:assert/strict';
import { recraftLogoPlan, recraftResult } from '../src/lib/logoRecraft.mjs';
import { generateRecraftLogo, validateLogoSvg } from '../src/lib/logoRecraftServer.js';

const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect width="1024" height="1024" fill="white"/></svg>');
test('Recraft tools retain native SVG backgrounds and vectorize raster images at the utility rate', () => {
  const vector = recraftLogoPlan({ operation: 'vectorize' }, { image: 'png' });
  assert.equal(vector.endpoint, 'images/vectorize'); assert.equal(vector.format, 'svg'); assert.equal(vector.cost, 0.01);
  assert.equal(recraftLogoPlan({ operation: 'removeBg', sourceFormat: 'svg' }, { image: 'svg' }).format, 'svg');
  assert.equal(recraftLogoPlan({ operation: 'removeBg', sourceFormat: 'png' }, { image: 'png' }).format, 'png');
  for (const operation of ['generate', 'edit', 'variations']) assert.throws(() => recraftLogoPlan({ operation }, { image: 'image' }), /Nano Banana Pro/);
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
