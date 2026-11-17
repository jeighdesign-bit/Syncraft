import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as resolutions from '../src/lib/extractionResolution.mjs';
import * as requests from '../src/lib/traceRequestPolicy.mjs';
import * as references from '../src/lib/referenceCategories.mjs';
import * as availability from '../src/lib/universalAvailability.mjs';
import * as exports from '../src/lib/artworkExport.mjs';

// Render the actual components without a browser or any paid provider requests.
const jsx = (type, props) => ({ type, props: props || {} });
const react = { memo: fn => fn, useState: initial => [initial, () => {}], useRef: value => ({ current: value }),
  useEffect() {}, useCallback: fn => fn };
const modules = {
  react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
  '@/lib/extractionResolution.mjs': resolutions, '@/lib/traceRequestPolicy.mjs': requests,
  '@/lib/referenceCategories.mjs': references,
  '@/lib/universalAvailability.mjs': { ...availability, UNIVERSAL_AVAILABLE: true },
  '@/lib/artworkExport.mjs': exports, '@/lib/pricing': { CREDIT_COST: { trace: 12 } },
  '../hooks/useExtractionModels': { useExtractionModels: () => ({ option: null, loading: false }) },
};
async function component(name) {
  const source = await readFile(new URL(`../src/app/workspace/[id]/components/${name}.js`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { fileName: `${name}.tsx`, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } });
  const context = vm.createContext({ exports: {}, process: { env: { NODE_ENV: 'test' } }, console,
    require: name => modules[name] || new Proxy({ __esModule: true, default: name.endsWith('.css') ? {} : () => null }, { get: (obj, key) => obj[key] || (() => null) }),
  });
  vm.runInContext(outputText, context);
  return context.exports.default;
}
const CropModal = await component('CropModal');
const PropertiesPanel = await component('PropertiesPanel');
function nodes(tree) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : text(tree?.props?.children || '');
const project = { id: 'uncropped-project', trace_type: 'mockup', original_image_url: 'https://storage.example/original.jpg' };
const panel = props => PropertiesPanel({ project, userCredits: 100, traceState: 'idle', consoleRef: { current: null }, ...props });
const generate = tree => nodes(tree).find(node => node.type === 'button' && node.props['aria-busy'] !== undefined);

test('Skip Crop unlocks the original for either provider and every resolution, without auto-generating or changing the source', () => {
  for (const garmentProvider of ['nano-banana', 'openai']) for (const extractionResolution of ['1K', '2K', '4K']) {
    let cropSkipped = false, generated = 0;
    const props = { garmentProvider, extractionResolution, onExecuteTrace: () => generated++ };
    assert.equal(generate(panel(props)).props.disabled, true);
    const modal = CropModal({ show: true, project, onClose() {}, onSkipCrop: () => { cropSkipped = true; } });
    nodes(modal).find(node => node.type === 'button' && text(node) === 'Keep Original (Skip Crop)').props.onClick();
    const button = generate(panel({ ...props, cropSkipped }));
    assert.equal(button.props.disabled, false);
    assert.match(button.props['aria-label'], /^Generate now/);
    assert.equal(generated, 0);
    assert.equal(project.original_image_url, 'https://storage.example/original.jpg');
    button.props.onClick();
    assert.equal(generated, 1);
  }
});

test('closing or cancelling crop does not silently approve the original, and Universal still requires crop', () => {
  let skipped = 0, closed = 0;
  const props = { show: true, project, onClose: () => closed++, onSkipCrop: () => skipped++ };
  nodes(CropModal(props)).find(node => node.props['aria-label'] === 'Close crop').props.onClick();
  const existing = CropModal({ ...props, project: { ...project, generated_image_url: 'https://storage.example/flat.png' } });
  nodes(existing).find(node => node.type === 'button' && text(node) === 'Cancel').props.onClick();
  assert.equal(skipped, 0);
  assert.equal(closed, 2);
  const universal = { ...project, trace_type: 'universal' };
  assert.equal(nodes(CropModal({ ...props, project: universal })).some(node => text(node) === 'Keep Original (Skip Crop)'), false);
  assert.equal(generate(panel({ project: universal, cropSkipped: true })).props.disabled, true);
});

test('skip keeps permissions, processing, credits, and missing-source guards in place', () => {
  for (const props of [{ readOnly: true }, { traceState: 'step1' }, { isSavingCrop: true }, { project: { ...project, original_image_url: null } }]) {
    assert.equal(generate(panel({ cropSkipped: true, ...props })).props.disabled, true);
  }
  let generated = 0, topUp = 0;
  const button = generate(panel({ cropSkipped: true, userCredits: 0, onExecuteTrace: () => generated++, onOpenTopUp: () => topUp++ }));
  button.props.onClick();
  assert.equal(generated, 0);
  assert.equal(topUp, 1);
});
