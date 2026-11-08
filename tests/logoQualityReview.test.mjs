import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { logoReviewContext, logoReviewOptions } from '../src/lib/logoReview.mjs';
import * as review from '../src/lib/logoReview.mjs';
import * as settings from '../src/lib/logoDesignSettings.mjs';
import * as studio from '../src/lib/logoStudio.mjs';
import * as capabilities from '../src/lib/logoStyleCapabilities.mjs';
import { applyLogoVariationStyle, compileLogoVariation } from '../src/lib/logoVariations.mjs';
import { logoCraftInstructions } from '../src/lib/logoCraft.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import * as enhancer from '../src/lib/logoPromptEnhancer.mjs';

const source = { id: 'original', operation: 'generate', mode: 'text', style: 'badge', status: 'succeeded', format: 'png',
  url: 'https://storage.test/original.png', batchId: 'batch', prompt: 'A bird above mountain peaks', brand: 'MOUNTAIN BIRDS', tagline: '', palette: [],
  designSettings: { badgeDirection: 'minimal-emblem', badgeShape: 'shield', badgeDetail: 'minimal' } };

test('review compares real batch siblings and excludes failed, unrelated-mode and utility outputs', () => {
  const sibling = { ...source, id: 'sibling' };
  const jobs = [source, sibling, { ...source, id: 'other', batchId: 'other' }, { ...source, id: 'failed', status: 'failed' },
    { ...source, id: 'image', mode: 'image' }, { ...source, id: 'utility', operation: 'vectorize' }];
  assert.deepEqual(logoReviewOptions(source, jobs), { isBatch: true, jobs: [source, sibling] });
  const publicJobs = studio.publicLogoProject({ id: 'project', canvas_data: { jobs } }).jobs;
  assert.deepEqual(logoReviewOptions(publicJobs[0], publicJobs).jobs.map(job => job.id), ['original', 'sibling']);
  const edited = { ...source, id: 'edited', operation: 'edit', sourceId: source.id, batchId: undefined, designSettings: {}, brand: 'NEW NAME' };
  assert.equal(logoReviewOptions(edited, [...jobs, edited]).jobs[0].id, 'edited');
  assert.equal(logoReviewOptions(edited, [...jobs, edited]).isBatch, false);
  const context = logoReviewContext(edited, [source, edited]);
  assert.equal(context.brand, 'NEW NAME'); assert.equal(context.prompt, source.prompt);
  assert.deepEqual(context.designSettings, source.designSettings);
});

test('Auto variations preserve the accepted finish while explicit targets receive their compatible controls', () => {
  const context = logoReviewContext(source, [source]);
  const auto = compileLogoVariation(applyLogoVariationStyle(context));
  assert.match(auto, /flat minimal mark stays flat and minimal/);
  assert.match(auto, /accepted image, including any style edits, is authoritative/);
  assert.doesNotMatch(auto, /Target design control:/);
  const targeted = compileLogoVariation(applyLogoVariationStyle(context, 'badge'));
  assert.match(targeted, /Target design control: Badge design direction: Minimal emblem/);
  assert.match(targeted, /avoid nested shields/);
  assert.match(targeted, /Target design control: Badge detail: Modern, minimalist/);
});

test('Text craft improves reproduction without changing subject, text placement or protected Streetwear', () => {
  const input = studio.validateLogoOperation({ ...source, operation: 'generate', requestId: crypto.randomUUID() });
  const brief = normalizeLogoBrief(input);
  const directions = fallbackLogoDirections(brief, 4);
  const prompts = directions.map(direction => compileLogoDirection(brief, direction));
  assert.equal(new Set(prompts).size, 4);
  for (const prompt of prompts) {
    assert.match(prompt, /Identity craft:/); assert.match(prompt, /Finish discipline:/);
    assert.match(prompt, /A bird above mountain peaks/); assert.match(prompt, /"MOUNTAIN BIRDS"/);
    assert.doesNotMatch(prompt, /lettering below|wordmark below/);
    assert.ok(prompt.length <= 10000);
  }
  assert.deepEqual(logoCraftInstructions('streetwear-lettering'), []);
});

async function renderComponent(name, props, expanded = false) {
  let source = await readFile(new URL(`../src/app/logo-studio/${name}.js`, import.meta.url), 'utf8');
  if (expanded) source = source.replace('useState(false)', 'useState(true)');
  const code = ts.transpileModule(source, { fileName: `${name}.jsx`, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  const require = createRequire(import.meta.url);
  const dependencies = { '@/lib/logoReview.mjs': review, '@/lib/logoDesignSettings.mjs': settings,
    '@/lib/logoStudio.mjs': studio, '@/lib/logoStyleCapabilities.mjs': capabilities, '@/lib/logoPromptEnhancer.mjs': enhancer,
    '@/components/Toast': { toast: { error() {} } },
    '@/components/Select': { __esModule: true, default: props => React.createElement('select', { 'aria-label': props['aria-label'] }, props.children) },
    './logoReview.module.css': { __esModule: true, default: {} }, './promptEnhancer.module.css': { __esModule: true, default: {} }, './generationControls.module.css': { __esModule: true, default: {} }, './designControls.module.css': { __esModule: true, default: {} } };
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name) });
  return renderToStaticMarkup(React.createElement(module.exports.default, props));
}

test('generation UI exposes actual concept modes, seed zero and style match with a clear missing-reference recovery', async () => {
  const advanced = await renderComponent('GenerationControls', { value: { conceptMode: 'faithful', seed: 0 }, onChange() {} });
  assert.match(advanced, /Follow brief closely/); assert.match(advanced, /value="0"/); assert.match(advanced, /exact repeats aren’t guaranteed/);
  const inspiration = await renderComponent('StyleInspiration', { file: { name: 'original.webp' }, match: 'precise', onFile() {}, onMatch() {} });
  assert.match(inspiration, /original.webp/); assert.match(inspiration, /Style inspiration matching/); assert.match(inspiration, /value="precise"/);
  assert.match(inspiration, /reference colors or motifs can still carry over/);
  const missing = await renderComponent('StyleInspiration', { missing: true, onFile() {} });
  assert.match(missing, /Reattach the original style image/); assert.match(missing, /Continue without inspiration/);
  assert.doesNotMatch(missing, /Style inspiration matching/);
});

test('enhancer applies directly without a preview or acceptance step and retains Undo and safe empty drafts', async () => {
  const props = { prompt: '', style: 'mascot', designSettings: {}, palette: [], brand: 'SEPARATE BRAND', tagline: '', request() {}, onApply() {}, onUndo() {} };
  const empty = await renderComponent('PromptEnhancer', props);
  assert.match(empty, /disabled=""[^>]*aria-label="Enhance prompt"/);
  assert.doesNotMatch(empty, /<dialog|Try again|Accept|Preview/);
  assert.doesNotMatch(empty, /SEPARATE BRAND|Undo prompt enhancement/);
  const accepted = await renderComponent('PromptEnhancer', { ...props, prompt: 'A lynx looking left.', enhancement: { version: enhancer.LOGO_ENHANCER_VERSION, originalPrompt: 'A lynx', enhancedPrompt: 'A lynx looking left.' } });
  assert.match(accepted, /Undo prompt enhancement/); assert.doesNotMatch(accepted, /<dialog|Try again|Accept|Preview/);
  const invalid = await renderComponent('PromptEnhancer', { ...props, prompt: 'A lynx', palette: ['invalid'] });
  assert.match(invalid, /disabled=""[^>]*aria-label="Enhance prompt"/);
});

test('saved enhanced brief review exposes the original idea for transparent reuse', async () => {
  const job = { ...source, prompt: 'A bird with broad wings above mountain peaks.', promptEnhancement: { version: enhancer.LOGO_ENHANCER_VERSION, originalPrompt: 'A bird above mountain peaks', enhancedPrompt: 'A bird with broad wings above mountain peaks.' } };
  const html = await renderComponent('LogoReview', { selected: job, jobs: [job], imageSrc: url => url });
  assert.match(html, /Original idea/); assert.match(html, /A bird above mountain peaks/);
});

test('Streetwear exact wording stays marked, while Wordmark and Badge brand fields remain optional', async () => {
  const props = { mode: 'text', style: 'wordmark', settings: {}, brand: '', tagline: '', onChange() {}, onBrandChange() {}, onTaglineChange() {} };
  for (const style of ['streetwear-lettering']) {
    const empty = await renderComponent('DesignControls', { ...props, style });
    assert.match(empty, /aria-label="Add required logo name"/); assert.match(empty, /Logo name · Required/);
    assert.match(empty, /Enter the exact logo name to enable Generate/);
    const named = await renderComponent('DesignControls', { ...props, style, brand: 'HOUSE' });
    assert.match(named, />HOUSE</); assert.doesNotMatch(named, /Add required logo name|Logo name · Required/);
  }
  const badge = await renderComponent('DesignControls', { ...props, style: 'badge' });
  assert.match(badge, /Your main text/); assert.doesNotMatch(badge, /Add required logo name|Logo name · Required/);
  const wordmark = await renderComponent('DesignControls', props);
  assert.match(wordmark, /Logo name \(optional\)/); assert.match(wordmark, /Name · Optional/);
  assert.doesNotMatch(wordmark, /Add required logo name|Logo name · Required/);
});

test('review shows real small sizes and separate saved wording; image flows never offer incomplete brief reuse', async () => {
  const props = { selected: source, jobs: [source], imageSrc: url => url };
  const html = await renderComponent('LogoReview', props);
  for (const size of [32, 64, 128]) assert.ok(html.includes(`width="${size}" height="${size}"`));
  assert.match(html, /Brand name/); assert.match(html, /MOUNTAIN BIRDS/);
  assert.match(html, /Minimal emblem/); assert.match(html, /Use this brief &amp; settings/);
  const image = { ...source, mode: 'image' };
  const referenceHtml = await renderComponent('LogoReview', { ...props, selected: image, jobs: [image] });
  assert.doesNotMatch(referenceHtml, /Use this brief &amp; settings/);
  assert.match(referenceHtml, /upload the original reference again/);
});

test('style controls disclose extras while always keeping already-selected controls visible', async () => {
  const props = { mode: 'text', style: 'badge', settings: { industry: 'sports' }, brand: '', tagline: '' };
  const collapsed = await renderComponent('DesignControls', props);
  assert.match(collapsed, /More settings/); assert.match(collapsed, /aria-label="Industry"/);
  assert.doesNotMatch(collapsed, /aria-label="Brand personality"/);
  const expanded = await renderComponent('DesignControls', props, true);
  assert.match(expanded, /Fewer settings/); assert.match(expanded, /aria-label="Brand personality"/);
});
