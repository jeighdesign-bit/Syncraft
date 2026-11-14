import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/app/community/CommunityLogoUpload.js', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;

function harness({ corrupt = false, pixels = 100, disabled = false, alphas = [0,255] } = {}) {
  const state = [], changed = [], revoked = [], exports = {};
  const react = require('react');
  vm.runInNewContext(code, { exports, document: { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: alphas.flatMap(alpha => [0,0,0,alpha]) }) }) }) }, Image: class {
    naturalWidth = pixels; naturalHeight = 1;
    set src(_url) { queueMicrotask(() => corrupt ? this.onerror() : this.onload()); }
  }, URL: { createObjectURL: () => 'blob:test-logo', revokeObjectURL: url => revoked.push(url) },
  require(name) {
    if (name === 'react') return { ...react, useRef: () => ({ current: null }), useState(initial) { const id = state.push(initial) - 1; return [initial, value => { state[id] = value; }]; } };
    if (name.endsWith('.module.css')) return { __esModule: true, default: {} };
    return require(name);
  } });
  const tree = exports.default({ file: null, preview: '', disabled, onChange: file => changed.push(file) });
  function find(node, type) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, type); if (result) return result; }
    return null;
  }
  return { tree, input: find(tree, 'input'), state, changed, revoked };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('logo selection decodes the image before accepting it and releases the temporary URL', async () => {
  const h = harness();
  const file = { name: 'logo.png', type: 'image/png', size: 100 };
  h.input.props.onChange({ target: { files: [file], value: 'logo.png' } });
  assert.equal(h.changed.length, 0);
  await flush();
  assert.equal(h.changed[0], file);
  assert.deepEqual(h.revoked, ['blob:test-logo']);
  assert.equal(h.state[1], false);
});

test('invalid types and oversized logos explain how to recover without replacing the selection', async () => {
  for (const [file, message] of [[{ type: 'image/svg+xml', size: 100 }, /PNG logo/], [{ type: 'image/jpeg', size: 100 }, /PNG logo/], [{ type: 'image/webp', size: 100 }, /PNG logo/], [{ type: 'image/png', size: 3 * 1024 * 1024 }, /under 2 MB/]]) {
    const h = harness();
    h.input.props.onChange({ target: { files: [file], value: '' } });
    await flush();
    assert.match(h.state[2], message); assert.equal(h.changed.length, 0); assert.equal(h.revoked.length, 0);
  }
});

test('opaque and entirely invisible PNGs receive an actionable error before selection', async () => {
  for (const [alphas, message] of [[[255,255], /Remove the background/], [[0,0], /PNG is empty/]]) {
    const h = harness({ alphas });
    h.input.props.onChange({ target: { files: [{ type: 'image/png', size: 100 }], value: '' } });
    await flush();
    assert.equal(h.changed.length, 0); assert.match(h.state[2], message);
  }
});

test('corrupt or excessively large decoded images do not replace a good logo', async () => {
  for (const options of [{ corrupt: true }, { pixels: 16_000_001 }]) {
    const h = harness(options);
    h.input.props.onChange({ target: { files: [{ type: 'image/png', size: 100 }], value: '' } });
    await flush();
    assert.equal(h.changed.length, 0); assert.ok(h.state[2]); assert.deepEqual(h.revoked, ['blob:test-logo']);
  }
});

test('file drops cannot change the logo while a submission is saving', async () => {
  const h = harness({ disabled: true });
  let prevented = false;
  const dropzone = h.tree.props.children[1];
  dropzone.props.onDrop({ preventDefault() { prevented = true; }, dataTransfer: { files: [{ type: 'image/png', size: 100 }] } });
  await flush();
  assert.equal(prevented, true); assert.equal(h.changed.length, 0);
});
