import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual request and sign-out callbacks without signing out the
// user's browser or making account/network changes.
const source = await readFile(new URL('../src/app/admin/generations/page.js', import.meta.url), 'utf8');
const ast = ts.createSourceFile('page.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
let requestSource, signOutSource;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'request') requestSource = node.initializer.arguments[0].getText(ast);
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'supabase.auth.onAuthStateChange') signOutSource = node.arguments[0].getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);

function harness() {
  let resolve;
  const cleared = [];
  const context = vm.createContext({ DOMException, AbortSignal, sessionEpoch: { current: 0 },
    fetch: () => new Promise(done => { resolve = done; }),
    ...Object.fromEntries(['setItems', 'setSelected', 'setNextCursor', 'setError'].map(name => [name, value => cleared.push({ name, value })])),
  });
  return { request: vm.runInContext(`(${requestSource})`, context), authChanged: vm.runInContext(`(${signOutSource})`, context),
    reply: body => resolve(Response.json(body)), cleared };
}

test('an admin history response arriving after sign-out cannot repopulate private results', async () => {
  const h = harness(), pending = h.request('');
  h.authChanged('SIGNED_OUT');
  h.reply({ projects: [{ id: 'private-result' }] });
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(h.cleared.some(entry => entry.name === 'setItems' && entry.value.length === 0), true);
});

test('normal history requests survive token-refresh events', async () => {
  const h = harness(), pending = h.request('');
  h.authChanged('TOKEN_REFRESHED');
  h.reply({ projects: [] });
  assert.deepEqual(await pending, { projects: [] });
  assert.equal(h.cleared.length, 0);
});
