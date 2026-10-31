import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { MAX_COMMENT_LENGTH } from '../src/lib/artworkEditComments.mjs';

async function harness(text = 'Remove this logo') {
  const source = await readFile(
    new URL('../src/app/workspace/[id]/components/ArtworkCommentPopover.js', import.meta.url),
    'utf8',
  );
  const compiled = ts.transpileModule(source.replace(/^import[\s\S]*?;\r?\n/gm, ''), {
    fileName: 'ArtworkCommentPopover.jsx',
    compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  const calls = { done: 0, deleted: 0, changes: [] };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    module,
    MAX_COMMENT_LENGTH,
    styles: {},
    Trash2: 'icon',
    React: {
      createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    },
  });
  const tree = module.exports.default({
    comment: { text },
    number: 1,
    position: { left: 200, top: 100, width: 296 },
    inputRef: { current: null },
    onChange: (value) => calls.changes.push(value),
    onDelete: () => calls.deleted++,
    onDone: () => calls.done++,
  });
  return { calls, input: tree.props.children[1], remove: tree.props.children[2] };
}

test('Enter finishes a local note while Escape closes an empty note without submitting an edit', async () => {
  for (const [key, text] of [
    ['Enter', 'Remove logo'],
    ['Escape', ''],
  ]) {
    const h = await harness(text);
    let prevented = false,
      stopped = false;
    h.input.props.onKeyDown({
      key,
      nativeEvent: {},
      preventDefault() {
        prevented = true;
      },
      stopPropagation() {
        stopped = true;
      },
    });
    assert.equal(h.calls.done, 1);
    assert.equal(prevented, true);
    assert.equal(stopped, true);
    assert.equal(h.input.props.maxLength, 300);
  }
});

test('typing and deleting use local callbacks, and IME composition never finishes the note', async () => {
  const h = await harness();
  h.input.props.onChange({ target: { value: 'Change to blue' } });
  assert.deepEqual(h.calls.changes, ['Change to blue']);
  h.input.props.onKeyDown({ key: 'Enter', nativeEvent: { isComposing: true } });
  assert.equal(h.calls.done, 0);
  h.remove.props.onClick();
  assert.equal(h.calls.deleted, 1);
});
