import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { svgPreviewUrl } from '../src/lib/workspacePreview.mjs';

async function harness() {
  const source = (await readFile(new URL('../src/components/SvgPreview.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?;\r?\n/gm, '');
  const compiled = ts.transpileModule(source, { fileName: 'SvgPreview.jsx', compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
  const states = [], effects = [];
  let cursor = 0;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports, module, svgPreviewUrl, setTimeout, clearTimeout,
    GenerationLoading: () => null,
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    useState: initial => { const index = cursor++; if (!(index in states)) states[index] = initial; return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }]; },
    useEffect: effect => effects.push(effect),
  });
  return { render(props = {}) { cursor = 0; effects.length = 0; return module.exports.default({ url: '/api/proxy?url=large.svg', ...props }); } };
}

test('detailed SVG previews use one image element instead of inserting vector paths into the page', async () => {
  const h = await harness();
  const tree = h.render();
  assert.equal(tree.props.dangerouslySetInnerHTML, undefined);
  const image = tree.props.children[0];
  assert.equal(image.type, 'img');
  assert.match(image.props.src, /preview=1&svgPreview=1$/);
  assert.equal(image.props.decoding, 'async');
});

test('SVG preview failures can retry without touching the saved source and loading clears on success', async () => {
  const h = await harness();
  let tree = h.render();
  tree.props.children[0].props.onError();
  tree = h.render();
  const feedback = tree.props.children[1];
  assert.equal(feedback.props.role, 'alert');
  const fragment = feedback.props.children[0];
  fragment.props.children[1].props.onClick();
  tree = h.render();
  assert.match(tree.props.children[0].props.src, /svgPreview=1&preview_retry=1$/);
  tree.props.children[0].props.onLoad({ currentTarget: { naturalWidth: 2286 } });
  tree = h.render();
  assert.equal(tree.props.children[1], false);
  assert.equal(tree.props.children[0].props.style.visibility, 'visible');
});

test('changing SVG source hides stale artwork while comparison cropping remains supported', async () => {
  const h = await harness();
  let tree = h.render();
  tree.props.children[0].props.onLoad({ currentTarget: { naturalWidth: 100 } });
  tree = h.render({ url: '/api/proxy?url=new.svg', objectFit: 'cover' });
  assert.equal(tree.props.children[0].props.style.visibility, 'hidden');
  assert.equal(tree.props.children[0].props.style.objectFit, 'cover');
});
