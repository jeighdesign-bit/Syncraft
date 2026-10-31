import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as preview from '../src/lib/workspacePreview.mjs';

async function harness() {
  const source = (await readFile(new URL('../src/app/workspace/[id]/components/SplitViewCanvas.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export default SplitViewCanvas;?\r?\n?/m, '');
  const code = ts.transpileModule(source, { fileName: 'canvas.jsx', compilerOptions: {
    jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const states = [], refs = [], effects = [], pending = [], events = {};
  let stateIndex, refIndex, effectIndex;
  const context = vm.createContext({ ...preview,
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    memo: fn => fn, useMemo: fn => fn(), useLayoutEffect() {},
    useState: initial => { const i = stateIndex++; if (!(i in states)) states[i] = initial;
      return [states[i], value => { states[i] = typeof value === 'function' ? value(states[i]) : value; }]; },
    useRef: initial => { const i = refIndex++; return refs[i] ||= { current: initial }; },
    useEffect: (fn, deps) => { const i = effectIndex++; const old = effects[i];
      if (!old || deps.some((v, j) => !Object.is(v, old[j]))) pending.push(fn); effects[i] = deps; },
    setTimeout: () => 1, clearTimeout() {},
    ...Object.fromEntries(['Scissors', 'ZoomIn', 'ZoomOut', 'Maximize', 'AlertCircle', 'Eraser', 'Loader2', 'ImageMinus', 'Zap', 'Expand', 'GenerationLoading', 'ExtendCanvas', 'WorkspaceTabs', 'SvgPreview'].map(name => [name, name])),
  });
  const Component = vm.runInContext(`${code}\nSplitViewCanvas`, context);
  return { states, refs, events,
    render(traceState = 'idle') {
      stateIndex = refIndex = effectIndex = 0;
      const tree = Component({ project: { id: 'p', original_image_url: 'original', generated_image_url: 'flat',
        upscaled_image_url: 'upscale', svg_url: 'vector' }, traceState, nodeErrors: {} });
      tree.props.ref.current = { addEventListener: (name, fn) => { events[name] = fn; }, removeEventListener() {} };
      for (const fn of pending.splice(0)) fn();
      return tree;
    },
  };
}

test('generation completion restores fit and opens HD Upscale instead of SVG', async () => {
  const h = await harness(); h.render('step3');
  h.states[1] = 2;
  h.refs[0].current = { scrollLeft: 30, scrollTop: 40 };
  h.refs[1].current = { scrollLeft: 30, scrollTop: 40 };
  h.render('idle');
  assert.equal(h.states[0], 'upscaled');
  assert.equal(h.states[1], 1);
  assert.equal(h.refs[0].current.scrollTop, 0);
  assert.equal(h.refs[1].current.scrollLeft, 0);
});

test('wheel zooms while the pointer is over an image pane and ignores the toolbar', async () => {
  const h = await harness(); h.render();
  h.refs[0].current = { scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => ({ left: 0, right: 400, top: 100, bottom: 700 }) };
  h.refs[1].current = { scrollLeft: 0, scrollTop: 0, getBoundingClientRect: () => ({ left: 400, right: 800, top: 100, bottom: 700 }) };
  let prevented = false;
  h.events.wheel({ clientX: 200, clientY: 300, deltaY: -100, preventDefault: () => { prevented = true; } });
  assert.equal(h.states[1], 1.25); assert.equal(prevented, true);
  h.render();
  prevented = false;
  h.events.wheel({ clientX: 600, clientY: 50, deltaY: -100, preventDefault: () => { prevented = true; } });
  assert.equal(h.states[1], 1.25); assert.equal(prevented, false);
});

test('users can still select Vector SVG manually after generation completes', async () => {
  const h = await harness(); const tree = h.render();
  const find = node => !node || typeof node !== 'object' ? null : node.type === 'WorkspaceTabs' ? node
    : (node.props?.children || []).flat(Infinity).map(find).find(Boolean);
  find(tree).props.onChange('svg');
  h.render();
  assert.equal(h.states[0], 'svg');
});
