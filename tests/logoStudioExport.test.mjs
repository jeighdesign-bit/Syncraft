import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { buildLegacyIllustrator, createLogoExport, resolveLogoExportJob } from '../src/lib/logoStudioExport.mjs';

const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><path fill="#ff8000" d="M10 10H90V40H10Z"/></svg>';
const imageJob = { id: 'original', status: 'succeeded', format: 'png', url: 'https://storage.example/original.png' };
const vectorJob = { id: 'vector', sourceId: 'original', operation: 'vectorize', status: 'succeeded', format: 'svg', url: 'https://storage.example/vector.svg' };

test('vector downloads use only a finished vector belonging to the selected logo', () => {
  assert.equal(resolveLogoExportJob([imageJob, vectorJob], 'original', 'svg'), vectorJob);
  assert.throws(() => resolveLogoExportJob([imageJob, vectorJob], 'original', 'ai'), /Choose PNG, JPG or SVG/);
  assert.equal(resolveLogoExportJob([imageJob, vectorJob], 'original', 'jpg'), imageJob);
  assert.equal(resolveLogoExportJob([vectorJob], 'vector', 'png'), vectorJob);
  assert.throws(() => resolveLogoExportJob([imageJob, { ...vectorJob, sourceId: 'other' }], 'original', 'svg'), /Vectorize/);
  assert.throws(() => resolveLogoExportJob([imageJob, { ...vectorJob, status: 'running' }], 'original', 'svg'), /Vectorize/);
  assert.throws(() => resolveLogoExportJob([imageJob], 'missing', 'png'), /finished logo/);
  assert.throws(() => resolveLogoExportJob([imageJob], 'original', 'constructor'), /Choose/);
});

test('PNG preserves transparency and JPEG deliberately uses a white matte', async () => {
  const pixels = Buffer.from([255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const original = await sharp(pixels, { raw: { width: 2, height: 2, channels: 4 } }).png().toBuffer();
  const png = await createLogoExport(original, 'png', 'png');
  assert.equal((await sharp(png).metadata()).format, 'png');
  assert.equal((await sharp(png).metadata()).hasAlpha, true);
  assert.deepEqual(await sharp(png).raw().toBuffer(), pixels);
  const jpg = await createLogoExport(original, 'png', 'jpg');
  const meta = await sharp(jpg).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.equal(meta.hasAlpha, false);
  const raw = await sharp(jpg).raw().toBuffer();
  assert.ok([...raw.slice(-3)].every(channel => channel >= 245), 'transparent corner should be white');
});

test('SVG can also be downloaded as a real PNG or JPEG', async () => {
  const png = await createLogoExport(Buffer.from(svg), 'svg', 'png');
  const meta = await sharp(png).metadata();
  assert.equal(meta.width, 100);
  assert.equal(meta.height, 50);
  assert.equal(meta.format, 'png');
  const jpg = await createLogoExport(Buffer.from(svg), 'svg', 'jpg');
  assert.equal((await sharp(jpg).metadata()).format, 'jpeg');
  assert.equal((await createLogoExport(Buffer.from(svg), 'svg', 'svg')).toString(), svg);
});

test('raster images cannot be disguised as SVG or Illustrator files', async () => {
  await assert.rejects(createLogoExport(Buffer.from('png'), 'png', 'svg'), /Vectorize/);
  await assert.rejects(createLogoExport(Buffer.from('png'), 'png', 'ai'), /Unsupported/);
  await assert.rejects(createLogoExport(Buffer.from(svg), 'svg', 'ai'), /Unsupported/);
  await assert.rejects(createLogoExport(Buffer.from('png'), 'png', '__proto__'), /Unsupported/);
});

test('legacy AI writes editable path coordinates, artboard bounds and RGB fill operators', () => {
  const ai = buildLegacyIllustrator(svg).toString();
  assert.ok(ai.startsWith('%!PS-Adobe-3.0 EPSF-3.0\n'));
  assert.match(ai, /%AI5_FileFormat 3/);
  assert.match(ai, /%%BoundingBox: 0 0 1024 512/);
  assert.match(ai, /1 0\.50196 0 Xa/);
  assert.match(ai, /102\.4 409\.6 m/);
  assert.match(ai, /921\.6 102\.4 l/);
  assert.ok(ai.endsWith('%%EOF\n'));
  assert.doesNotMatch(ai, /<svg|<image|\/ImageType/);
});

test('AI preserves compound-path holes and the closing Bezier segment', () => {
  const compound = '<svg viewBox="0 0 100 100"><path fill="#000" fill-rule="evenodd" d="M0 0H100V100H0Z M20 20V80H80V20Z"/></svg>';
  const ai = buildLegacyIllustrator(compound).toString();
  assert.match(ai, /1 XR\n\*u\n/);
  assert.equal(ai.split('\n').filter(line => line.endsWith(' m')).length, 2);
  assert.equal(ai.split('\n').filter(line => line === '*U').length, 1);
  const circle = buildLegacyIllustrator('<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#123456"/></svg>').toString();
  assert.equal(circle.split('\n').filter(line => line.endsWith(' c')).length, 4);
});

test('unsupported AI effects fail clearly rather than changing the artwork', () => {
  for (const artwork of [
    '<g transform="translate(5 5)"><path d="M0 0H50V50Z"/></g>',
    '<path opacity=".5" d="M0 0H50V50Z"/>',
    '<path fill="url(#paint)" d="M0 0H50V50Z"/>',
    '<path stroke="#ff0000" d="M0 0H50V50Z"/>',
    '<style>path{fill:red}</style><path d="M0 0H50V50Z"/>',
  ]) assert.throws(() => buildLegacyIllustrator(`<svg viewBox="0 0 100 100">${artwork}</svg>`), /cannot preserve/);
});

test('active or external SVG content is rejected before exporting', async () => {
  for (const unsafe of [
    '<script>alert(1)</script>', '<image href="https://example.com/image.png"/>',
    '<path onload="alert(1)" d="M0 0H10V10Z"/>',
    '<path fill="url(https://example.com/paint)" d="M0 0H10V10Z"/>',
  ]) await assert.rejects(createLogoExport(Buffer.from(`<svg>${unsafe}</svg>`), 'svg', 'svg'));
});
