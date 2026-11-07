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

const require = createRequire(import.meta.url);
const original = await readFile(new URL('../src/app/logo-studio/LogoStudio.js', import.meta.url), 'utf8');
// Seed the real component's initial state to exercise the render that happens
// before its preview effect catches up with a changed/cleared source file.
const seeded = original
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
      const option = html.match(/<option value="streetwear-lettering"[^>]*>/)?.[0];
      assert.equal(Boolean(option), mode === 'text');
      if (option) assert.equal(option.includes('disabled=""'), !brand);
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
    const streetwearOption = html.match(/<option value="streetwear-lettering"[^>]*>/)?.[0];
    assert.equal(Boolean(streetwearOption), originMode === 'text');
    if (streetwearOption) assert.equal(streetwearOption.includes('disabled=""'), false);
    assert.match(html, /<option value="wordmark">/);
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
  assert.match(auto, /value="auto"[^>]*selected=""/);
  assert.match(auto, /Create variation/);
  assert.doesNotMatch(auto, /<label>New style/);
  const changed = renderPreview(null, null, project, 'image', { sourceId: 'owl', value: 'line' }, 'owl');
  assert.equal((changed.match(/<select\b/g) || []).length, 1);
  assert.match(changed, /optgroup label="Change style"/);
  assert.match(changed, /value="line" selected=""/);
  assert.match(changed, /value="wordmark" disabled=""/);
  assert.match(changed, /value="monogram" disabled=""/);
  const otherSource = renderPreview(null, null, project, 'image', { sourceId: 'other-logo', value: 'line' }, 'owl');
  assert.match(otherSource, /value="auto"[^>]*selected=""/);
  const viewer = renderPreview(null, null, { ...project, access: 'view' }, 'image', null, 'owl');
  assert.doesNotMatch(viewer, /role="dialog" aria-label="Create logo variations"/);
});
