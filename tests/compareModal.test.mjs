import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { comparePreviewLayout, previewProxyUrl } from '../src/lib/workspacePreview.mjs';

async function harness() {
  const source = await readFile(
    new URL('../src/app/workspace/[id]/components/CompareModal.js', import.meta.url),
    'utf8',
  );
  const compiled = ts.transpileModule(source.replace(/^import[\s\S]*?;\r?\n/gm, ''), {
    fileName: 'CompareModal.jsx',
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    comparePreviewLayout,
    previewProxyUrl,
    memo: (fn) => fn,
    useRef: (initial) => ({ current: initial }),
    useState: (initial) => [initial, () => {}],
    useEffect() {},
    React: {
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    },
    CheckCircle: 'icon',
    X: 'icon',
    SvgPreview: 'SvgPreview',
  });
  const tree = module.exports.default({
    show: true,
    project: { original_image_url: 'before', upscaled_image_url: 'after' },
    onClose() {},
  });
  let slider;
  const refElements = [];
  function mount(node) {
    if (!node || typeof node !== 'object') return;
    if (node.props.ref) {
      const attrs = { ...node.props };
      node.props.ref.current = {
        style: { ...node.props.style },
        getAttribute: (name) => attrs[name],
        setAttribute: (name, value) => {
          attrs[name] = value;
        },
        getBoundingClientRect: () => ({ left: 100, width: 400 }),
        setPointerCapture() {},
      };
      refElements.push(node.props.ref.current);
    }
    if (node.props.role === 'slider') slider = node;
    (node.props.children || []).flat(Infinity).forEach(mount);
  }
  mount(tree);
  return { tree, slider, container: refElements[0], overlay: refElements[1], line: refElements[2] };
}

test('comparison dragging updates both layers together and stays inside the canvas', async () => {
  const h = await harness();
  h.slider.props.onPointerDown({ currentTarget: h.container, pointerId: 1, clientX: 200 });
  assert.equal(h.container.getAttribute('aria-valuenow'), '25');
  assert.equal(h.overlay.style.clipPath, 'inset(0 75% 0 0)');
  assert.equal(h.line.style.left, '25%');
  h.tree.props.onPointerMove({ clientX: 900 });
  assert.equal(h.line.style.left, '100%');
  h.tree.props.onPointerMove({ clientX: 0 });
  assert.equal(h.overlay.style.clipPath, 'inset(0 100% 0 0)');
  h.tree.props.onPointerUp();
  h.tree.props.onPointerMove({ clientX: 300 });
  assert.equal(h.line.style.left, '0%');
});

test('keyboard comparison uses the same position and leaves unrelated keys alone', async () => {
  const h = await harness();
  let prevented = 0;
  const key = (value) =>
    h.slider.props.onKeyDown({
      key: value,
      currentTarget: h.container,
      preventDefault() {
        prevented++;
      },
    });
  key('ArrowRight');
  assert.equal(h.line.style.left, '55%');
  assert.equal(h.overlay.style.clipPath, 'inset(0 45% 0 0)');
  key('End');
  assert.equal(h.container.getAttribute('aria-valuenow'), '100');
  key('Home');
  assert.equal(h.line.style.left, '0%');
  key('Tab');
  assert.equal(prevented, 3);
});
