import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as logoStudio from '../src/lib/logoStudio.mjs';
import * as logoStyleCapabilities from '../src/lib/logoStyleCapabilities.mjs';
import * as logoVariations from '../src/lib/logoVariations.mjs';
import * as styleSelection from '../src/app/logo-studio/styleSelection.mjs';
import * as logoStylePreviews from '../src/lib/logoStylePreviews.mjs';
import * as generationOptions from '../src/lib/logoGenerationOptions.mjs';
import * as review from '../src/lib/logoReview.mjs';
import * as enhancer from '../src/lib/logoPromptEnhancer.mjs';

const require = createRequire(import.meta.url);
// Render the shared Select with its list open to check actual option eligibility.
const selectSource = (await readFile(new URL('../src/components/Select.js', import.meta.url), 'utf8'))
  .replace('const [open, setOpen] = useState(false);', 'const [open, setOpen] = useState(true);');
const selectCode = ts.transpileModule(selectSource, { fileName: 'Select.jsx', compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
} }).outputText;
const selectModule = { exports: {} };
vm.runInNewContext(selectCode, { module: selectModule, exports: selectModule.exports, require: name => name === './Select.module.css'
  ? { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) } : require(name) });
function variationOption(html, label) {
  return [...html.matchAll(/<div[^>]*role="option"[^>]*><span>([^<]*)<\/span>/g)]
    .find(match => match[1] === label || match[1].startsWith(label + ' —'))?.[0];
}
const original = await readFile(new URL('../src/app/logo-studio/LogoStudio.js', import.meta.url), 'utf8');
// Seed the real component's initial state to exercise the render that happens
// before its preview effect catches up with a changed/cleared source file.
const seeded = original
  .replace("const [prompt, setPrompt] = useState('');", "const [prompt, setPrompt] = useState(__previewTest.form.prompt || '');")
  .replace('const [enhancing, setEnhancing] = useState(false);', 'const [enhancing, setEnhancing] = useState(Boolean(__previewTest.form.enhancing));')
  .replace('const [count, setCount] = useState(1);', 'const [count, setCount] = useState(__previewTest.form.count || 1);')
  .replace("const [style, setStyle] = useState('minimalist');", "const [style, setStyle] = useState(__previewTest.form.style || 'minimalist');")
  .replace("const [brand, setBrand] = useState('');", "const [brand, setBrand] = useState(__previewTest.form.brand || '');")
  .replace('const [authReady, setAuthReady] = useState(false);', 'const [authReady, setAuthReady] = useState(true);')
  .replace('const [project, setProject] = useState(null);', 'const [project, setProject] = useState(__previewTest.project);')
  .replace('const [selectedId, setSelectedId] = useState(null);', 'const [selectedId, setSelectedId] = useState(__previewTest.project?.jobs?.[0]?.id || null);')
  .replace('const [variationChoice, setVariationChoice] = useState(null);', 'const [variationChoice, setVariationChoice] = useState(__previewTest.variationChoice);')
  .replace('const [variationPanelSource, setVariationPanelSource] = useState(null);', 'const [variationPanelSource, setVariationPanelSource] = useState(__previewTest.variationPanelSource);')
  .replace("const [mode, setMode] = useState('text');", "const [mode, setMode] = useState(__previewTest.mode);")
  .replace('const [source, setSource] = useState(null);', 'const [source, setSource] = useState(__previewTest.source);')
  .replace('const [sourcePreview, setSourcePreview] = useState(null);', 'const [sourcePreview, setSourcePreview] = useState(__previewTest.preview);');
assert.notEqual(seeded, original);
const compiled = ts.transpileModule(seeded, { fileName: 'LogoStudio.jsx', compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
} }).outputText;

function renderPreview(source, preview, project = null, mode = 'image', variationChoice = null, variationPanelSource = null, form = {}) {
  const module = { exports: {} };
  const emptyComponent = { __esModule: true, default: () => null };
  const dependencies = {
    'next/link': emptyComponent,
    'next/navigation': { useRouter: () => ({}) },
    '@/components/WorkspaceHeader': { __esModule: true, default: ({ actions }) => React.createElement('header', null, actions) },
    '@/components/GenerationLoading': emptyComponent,
    '@/components/WorkspaceTabs': emptyComponent,
    '@/components/Select': selectModule.exports,
    '@/components/Toast': { toast: { success() {}, info() {} } },
    '@/components/TopUpModal': emptyComponent,
    '@/utils/supabase/client': { createClient: () => ({}) },
    '@/utils/uploadClient': {},
    '@/lib/logoStudio.mjs': logoStudio,
    '@/lib/logoStylePreviews.mjs': logoStylePreviews,
    '@/lib/logoStyleCapabilities.mjs': logoStyleCapabilities,
    '@/lib/logoVariations.mjs': logoVariations,
    './styleSelection.mjs': styleSelection,
    '@/lib/logoDesignSettings.mjs': { normalizeLogoDesignSettings: value => value || {} },
    '@/app/components/LoginModal': emptyComponent,
    '@/app/components/SectionBadge': { __esModule: true, default: ({ children, className }) => React.createElement('span', { className }, children) },
    './SketchCanvas': emptyComponent,
    './DownloadMenu': emptyComponent,
    './DesignControls': { __esModule: true, default: () => React.createElement('div', { 'data-testid': 'design-controls' }) },
    './LogoReview': { __esModule: true, default: () => React.createElement('button', { type: 'button' }, 'Review & brief') },
    './PromptEnhancer': { __esModule: true, default: () => React.createElement('button', { type: 'button', 'data-testid': 'prompt-enhancer' }, 'Enhance') },
    '@/lib/logoPromptEnhancer.mjs': enhancer,
    './GenerationControls': { __esModule: true, default: () => React.createElement('div', { 'data-testid': 'generation-controls' }) },
    './StyleInspiration': { __esModule: true, default: () => React.createElement('div', { 'data-testid': 'style-inspiration' }) },
    '@/lib/logoGenerationOptions.mjs': generationOptions,
    '@/lib/logoReview.mjs': review,
    './ColorControls': { __esModule: true, default: () => React.createElement('div', { 'data-testid': 'color-controls' }) },
    './ExamplePrompts': emptyComponent,
    './SourceCropModal': emptyComponent,
    '@/app/workspace/[id]/components/ShareProjectModal': emptyComponent,
    './EditArea': emptyComponent,
    './studio.module.css': { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) },
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, __previewTest: { source, preview, project, mode, variationChoice, variationPanelSource, form },
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
  });
  return renderToStaticMarkup(React.createElement(module.exports.default));
}

test('style inspiration and creation controls appear only in Text to Logo', () => {
  for (const mode of ['text', 'image', 'sketch']) {
    const html = renderPreview(null, null, null, mode);
    for (const control of ['style-inspiration', 'generation-controls', 'prompt-enhancer']) assert.equal(html.includes(`data-testid="${control}"`), mode === 'text');
  }
});

test('Generate waits while the prompt is being enhanced so it cannot submit the previous idea', () => {
  for (const enhancing of [true, false]) {
    const html = renderPreview(null, null, null, 'text', null, null, { prompt: 'A lynx', enhancing });
    const button = html.match(/<button[^>]*aria-label="Generate 1 logo"[^>]*>/)?.[0];
    assert.ok(button); assert.equal(button.includes('disabled=""'), enhancing);
  }
});

test('Streetwear generation explains its missing exact lettering and enables when supplied', () => {
  for (const style of ['streetwear-lettering']) {
    for (const brand of ['', '   ', 'HOUSE']) {
      const html = renderPreview(null, null, null, 'text', null, null, { style, brand, prompt: 'Build a house from a square, triangle and circle' });
      const button = html.match(/<button class="generate"[^>]*>/)?.[0];
      assert.ok(button); assert.equal(button.includes('disabled=""'), !brand.trim());
      assert.equal(html.includes('id="logo-generation-requirement"'), !brand.trim());
      assert.equal(button.includes('logo-generation-requirement logo-prompt-cost'), !brand.trim());
      if (!brand.trim()) { assert.match(html, /needs a logo name/); assert.match(html, /Add your logo name/); }
      else assert.match(html, /Your logo name is ready/);
    }
    const namedOnly = renderPreview(null, null, null, 'text', null, null, { style, brand: 'HOUSE' });
    assert.doesNotMatch(namedOnly.match(/<button class="generate"[^>]*>/)?.[0] || '', /disabled/);
  }
  const symbol = renderPreview(null, null, null, 'text', null, null, { style: 'minimalist', prompt: 'A house from three shapes' });
  assert.doesNotMatch(symbol, /id="logo-generation-requirement"/);
  assert.doesNotMatch(symbol.match(/<button class="generate"[^>]*>/)?.[0] || '', /disabled/);
});

test('Wordmark brand is optional with a brief, while brand-only creation also stays available', () => {
  for (const form of [
    { brand: '', prompt: 'Building a “House” from a square, triangle and circle' },
    { brand: '   ', prompt: 'The word HOUSE in geometric letters' },
    { brand: 'HOUSE', prompt: '' },
  ]) {
    const html = renderPreview(null, null, null, 'text', null, null, { style: 'wordmark', ...form });
    assert.match(html, /Brand name <span>Optional/);
    assert.doesNotMatch(html, /id="logo-generation-requirement"/);
    assert.doesNotMatch(html.match(/<button class="generate"[^>]*>/)?.[0] || '', /disabled/);
  }
  const empty = renderPreview(null, null, null, 'text', null, null, { style: 'wordmark' });
  assert.match(empty.match(/<button class="generate"[^>]*>/)?.[0] || '', /disabled/);
});

test('a cleared source with a stale preview renders the upload control without crashing', () => {
  for (const stale of ['blob:previous-preview', { file: { name: 'old.png' }, url: 'blob:old' }]) {
    const html = renderPreview(null, stale);
    assert.match(html, /Upload your image/);
    assert.doesNotMatch(html, /alt="Your source image"/);
  }
});

test('all three creation modes expose the shared design and optional color controls', () => {
  for (const mode of ['text', 'image', 'sketch']) {
    const html = renderPreview(null, null, null, mode);
    assert.match(html, /data-testid="design-controls"/);
    assert.match(html, /data-testid="color-controls"/);
  }
});

test('Streetwear appears in Text to Logo only and requires exact text instead of an extra description', () => {
  const style = logoStyleCapabilities.STREETWEAR_STYLE;
  for (const mode of ['text', 'image', 'sketch']) {
    const html = renderPreview(null, null, null, mode);
    assert.equal(html.includes("/images/logo-styles/streetwear-sonder-transparent.png"), mode === 'text');
    const expectedCount = logoStudio.LOGO_STYLES.filter(item => logoStyleCapabilities.isLogoStyleAvailable(item.id, mode)).length;
    assert.ok(html.includes(`${expectedCount} styles`));
    if (mode === 'image') {
      assert.match(html, /9 styles/);
      for (const label of ['Monogram', 'Wordmark', 'Abstract']) assert.equal(html.includes(`aria-label="${label}"`), false);
    }
  }
  for (const brand of ['', '   ', 'NORTHSIDE']) {
    const html = renderPreview(null, null, null, 'text', null, null, { style, brand });
    assert.match(html, /Required for Streetwear Lettering/);
    assert.match(html, /required="" placeholder="Exact words for your logo"/);
    assert.match(html, /Optional lettering direction/);
    const button = html.match(/<button class="generate"[^>]*>/)?.[0];
    assert.ok(button);
    assert.equal(button.includes('disabled=""'), !brand.trim());
  }
});

test('Streetwear variation targets require a text source and saved brand text', () => {
  for (const mode of ['text', 'image', 'sketch']) {
    for (const brand of ['', 'NORTHSIDE']) {
      const project = { id: 'project', name: 'Lettering', access: 'owner', jobs: [
        { id: 'logo', mode, style: 'wordmark', brand, status: 'succeeded', operation: 'generate', format: 'png', url: 'https://storage.test/logo.png' },
      ] };
      const html = renderPreview(null, null, project, mode, null, 'logo');
      const option = variationOption(html, 'Streetwear Lettering');
      assert.equal(Boolean(option), mode === 'text');
      if (option) assert.equal(option.includes('aria-disabled="true"'), !brand);
    }
  }
});

test('variation eligibility follows original mode and saved text through edited and utility versions', () => {
  for (const originMode of ['text', 'image']) {
    const savedMode = originMode === 'text' ? 'image' : 'text';
    const project = { id: 'project', name: 'Lettering', access: 'owner', jobs: [
      { id: 'transparent', sourceId: 'edit', mode: savedMode, style: 'wordmark', status: 'succeeded', operation: 'removeBg', format: 'png', url: 'https://storage.test/transparent.png' },
      { id: 'edit', sourceId: 'original', mode: savedMode, style: 'wordmark', status: 'succeeded', operation: 'edit', format: 'png', url: 'https://storage.test/edit.png' },
      { id: 'original', mode: originMode, style: 'wordmark', brand: 'NORTHSIDE', status: 'succeeded', operation: 'generate', format: 'png', url: 'https://storage.test/original.png' },
    ] };
    const html = renderPreview(null, null, project, savedMode, null, 'transparent');
    const streetwearOption = variationOption(html, 'Streetwear Lettering');
    assert.equal(Boolean(streetwearOption), originMode === 'text');
    if (streetwearOption) assert.equal(streetwearOption.includes('aria-disabled="true"'), false);
    assert.equal(Boolean(variationOption(html, 'Wordmark')), originMode === 'text');
    if (originMode === 'text') assert.doesNotMatch(variationOption(html, 'Wordmark'), /aria-disabled="true"/);
  }
});

test('a replacement source never displays the previous file preview', () => {
  const first = { name: 'first.png' };
  const next = { name: 'next.png' };
  const html = renderPreview(next, { file: first, url: 'blob:first' });
  assert.match(html, /Upload your image/);
  assert.doesNotMatch(html, /src="blob:first"/);
});

test('a preview paired with the current file renders its image and filename', () => {
  const source = { name: 'reference.png' };
  const html = renderPreview(source, { file: source, url: 'blob:reference' });
  assert.match(html, /src="blob:reference"/);
  assert.match(html, /alt="Your source image"/);
  assert.match(html, /Remove source image/);
  assert.match(html, />reference\.png<\/span>/);
  assert.match(html, /Crop image/);
  const sketchHtml = renderPreview(source, { file: source, url: 'blob:reference' }, null, 'sketch');
  assert.doesNotMatch(sketchHtml, /Crop image/);
});

test('a rejected generation preserves the current reference and explains the failure in the canvas', () => {
  const source = { name: 'reference.png' };
  const message = 'The image provider declined this request during its content check. Credits refunded.';
  const project = { id: 'project', name: 'Portrait', access: 'owner', jobs: [
    { id: 'failed-image', mode: 'image', operation: 'generate', status: 'failed', error: message },
  ] };
  const html = renderPreview(source, { file: source, url: 'blob:reference' }, project);
  assert.match(html, /alt="Reference image for your logo"/);
  assert.match(html, /Your logo could not be generated/);
  assert.match(html, /role="alert">The image provider declined/);
  assert.doesNotMatch(html, /Add a reference image to get started/);
  const otherMode = renderPreview(null, null, project, 'text');
  assert.doesNotMatch(otherMode, /Your logo could not be generated|role="alert"/);
});

test('shared viewers can preview saved logos while AI actions and sharing management follow their role', () => {
  for (const access of ['owner', 'edit', 'view']) {
    const html = renderPreview(null, null, { id: 'project', name: 'Shared logo', access, jobs: [{ id: 'logo', mode: 'image', status: 'succeeded', operation: 'generate', format: 'png', url: 'https://storage.test/logo.png' }] });
    assert.match(html, /alt="Shared logo logo, Original"/);
    const editButton = html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*?AI edit(?:(?!<\/button>)[\s\S])*?<\/button>/)?.[0];
    assert.ok(editButton);
    assert.equal(/^<button[^>]*disabled=""/.test(editButton), access === 'view');
    assert.equal(html.includes('<span>Share</span>'), access === 'owner');
    if (access === 'view') assert.match(html, /View-only access/);
    if (access === 'edit') assert.match(html, /Uses your credits/);
  }
});

test('an image result is previewed and marked selected only in Image to Logo', () => {
  const project = { id: 'project', name: 'Portrait', access: 'owner', jobs: [
    { id: 'image-result', mode: 'image', status: 'succeeded', operation: 'generate', format: 'png', url: 'https://storage.test/portrait.png' },
  ] };
  const imageView = renderPreview(null, null, project, 'image');
  assert.match(imageView, /alt="Portrait logo, Original"/);
  assert.match(imageView, /aria-pressed="true"[^>]*aria-label="Version 1, Original, succeeded"/);
  for (const mode of ['text', 'sketch']) {
    const html = renderPreview(null, null, project, mode);
    assert.doesNotMatch(html, /alt="Portrait logo, Original"/);
    assert.match(html, /aria-label="Logo canvas"/);
    assert.match(html, /aria-pressed="false"[^>]*aria-label="Version 1, Original, succeeded"/);
  }
});

test('variation options stay hidden until opened and retain Auto and explicit styles in the popover', () => {
  const project = { id: 'project', name: 'Owl', access: 'owner', jobs: [
    { id: 'owl', mode: 'image', style: 'minimalist', status: 'succeeded', operation: 'generate', format: 'png', url: 'https://storage.test/owl.png' },
  ] };
  const closed = renderPreview(null, null, project);
  assert.doesNotMatch(closed, /Create logo variations|Variation style<select/);
  assert.match(closed, /aria-haspopup="dialog" aria-expanded="false"/);
  const auto = renderPreview(null, null, project, 'image', null, 'owl');
  assert.match(auto, /role="dialog" aria-label="Create logo variations"/);
  assert.match(variationOption(auto, 'Auto'), /aria-selected="true"/);
  assert.match(auto, /Create variation/);
  assert.doesNotMatch(auto, /<label>New style/);
  const changed = renderPreview(null, null, project, 'image', { sourceId: 'owl', value: 'line' }, 'owl');
  assert.doesNotMatch(changed, /<select\b/);
  assert.match(changed, /role="listbox" aria-label="Variation style"/);
  assert.match(variationOption(changed, 'Line art'), /aria-selected="true"/);
  assert.equal(variationOption(changed, 'Wordmark'), undefined);
  assert.equal(variationOption(changed, 'Monogram'), undefined);
  assert.equal(variationOption(changed, 'Abstract'), undefined);
  const otherSource = renderPreview(null, null, project, 'image', { sourceId: 'other-logo', value: 'line' }, 'owl');
  assert.match(variationOption(otherSource, 'Auto'), /aria-selected="true"/);
  const viewer = renderPreview(null, null, { ...project, access: 'view' }, 'image', null, 'owl');
  assert.doesNotMatch(viewer, /role="dialog" aria-label="Create logo variations"/);
});

test('four saved originals do not disable more variations or shrink the next batch choices', () => {
  const project = { id: 'project', name: 'More variations', access: 'owner', jobs: Array.from({ length: 4 }, (_, index) => ({
    id: `logo-${index}`, mode: 'image', style: 'mascot', status: 'succeeded', operation: 'generate', format: 'png', url: `https://storage.test/${index}.png`,
  })) };
  const html = renderPreview(null, null, project, 'image', null, 'logo-0');
  const variationButton = html.match(/<button\b[^>]*aria-haspopup="dialog"[^>]*>/)?.[0];
  assert.ok(variationButton); assert.doesNotMatch(variationButton, /disabled/);
  assert.match(html, /Create variation for 6 credits/);
  const options = html.match(/aria-label="Number of logo options">([\s\S]*?)<\/div>/)?.[1];
  assert.equal((options.match(/<button\b/g) || []).length, 4);
  assert.match(html, /logos per batch/);
  assert.doesNotMatch(html, /Limit reached|4-logo limit|0 cr/);
});

test('variation buttons show six credits per output for every batch size and creation mode', () => {
  for (const mode of ['text', 'image', 'sketch']) for (const count of [1, 2, 3, 4]) {
    const project = { id: 'project', access: 'owner', jobs: [
      { id: 'logo', mode, style: 'mascot', status: 'succeeded', operation: 'generate', format: 'png', url: 'https://storage.test/logo.png' },
    ] };
    const html = renderPreview(null, null, project, mode, null, 'logo', { count });
    assert.ok(html.includes(`Variations <small>${count * 6} cr</small>`));
    assert.ok(html.includes(`aria-label="Create ${count === 1 ? 'variation' : `${count} variations`} for ${count * 6} credits"`));
    assert.ok(html.includes(`${count * 8} credits · Failed outputs are refunded.`));
  }
});
