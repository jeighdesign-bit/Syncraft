import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/components/Toast.js', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace('<style jsx global>', '<style>'), {
  fileName: 'Toast.jsx',
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

test('saved notifications use a fixed status outside the workspace and disappear after four seconds', () => {
  let state = [];
  let mounted = false;
  const timers = [];
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require: name => name === 'react' ? {
      useState: () => [state, update => { state = typeof update === 'function' ? update(state) : update; }],
      useEffect: effect => { if (!mounted) { mounted = true; effect(); } },
    } : require(name),
    setTimeout: (callback, delay) => timers.push({ callback, delay }),
  });
  const { ToastContainer, toast } = module.exports;
  const render = () => renderToStaticMarkup(ToastContainer());
  render();
  toast.info('Request saved. You can leave and reopen this project.');
  const visible = render();
  assert.match(visible, /position:fixed;bottom:24px;right:24px/);
  assert.match(visible, /role="status" aria-atomic="true"/);
  assert.match(visible, /Request saved/);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 4000);
  timers[0].callback();
  assert.doesNotMatch(render(), /Request saved/);
});
