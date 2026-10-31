import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import * as availability from '../src/lib/universalAvailability.mjs';

function elements(root) {
  const nodes = [];
  function visit(node) {
    if (!node || typeof node !== 'object') return;
    nodes.push(node);
    [node.props?.children].flat(Infinity).forEach(visit);
  }
  visit(root);
  return nodes;
}

function textContent(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return [node?.props?.children].flat(Infinity).map(child => child && typeof child === 'object' ? textContent(child) : child || '').join(' ');
}

async function component(file, options = {}) {
  const source = (await readFile(new URL(`../src/app/components/${file}.js`, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '');
  const code = ts.transpileModule(source, { fileName: `${file}.jsx`, compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  const names = Object.fromEntries([...source.matchAll(/<([A-Z][A-Za-z0-9]*)\b/g)].map(match => [match[1], match[1]]));
  const changes = [];
  let stateIndex = 0;
  const icons = Object.fromEntries(['Shirt', 'PenTool', 'ScanLine', 'Image', 'LayoutDashboard', 'FolderOpen', 'FileText', 'Send', 'ShoppingBag', 'Menu', 'Scissors'].map(name => [name, name]));
  const context = vm.createContext({ ...icons, ...names, ...availability, module, exports: module.exports,
    styles: new Proxy({}, { get: (_target, key) => key }), memo: fn => fn,
    useState(initial) {
      const index = stateIndex++;
      const value = options.states?.[index] ?? (initial === 'mockup_erase' && options.traceType ? options.traceType : initial);
      return [value, next => changes.push({ index, value: next })];
    },
    useEffect() {}, useRef: initial => ({ current: initial }),
    React: { Fragment: 'fragment', createElement(type, props, ...children) {
      const node = { type, props: { ...props, children: children.length === 1 ? children[0] : children } };
      return options.expand && typeof type === 'function' ? type(node.props) : node;
    } },
    console, ...options.context,
  });
  vm.runInContext(code, context);
  return { render: module.exports.default, changes };
}

test('Universal sidebar remains visible and cannot open or close the tool menu, including direct handler invocation', async () => {
  const opened = [];
  let closed = 0;
  const h = await component('WorkspaceSidebar', { expand: true, context: { ResponsivePanel: ({ children }) => children({ close: () => closed++ }) } });
  const nodes = elements(h.render({ onOpenFeature: action => opened.push(action) }));
  const unavailable = nodes.find(node => node.type === 'button' && textContent(node).includes('Universal Extraction'));
  assert.equal(unavailable.props.disabled, true);
  assert.match(textContent(unavailable), /Unavailable/);
  assert.ok(textContent(unavailable).includes('Unavailable'));
  assert.ok(!textContent(unavailable).includes(availability.UNIVERSAL_UNAVAILABLE_MESSAGE));
  unavailable.props.onClick();
  assert.deepEqual(opened, []); assert.equal(closed, 0);
  nodes.find(node => node.type === 'button' && textContent(node).trim() === 'Garment Extraction').props.onClick();
  assert.deepEqual(opened, ['garment']); assert.equal(closed, 1);
});

test('Universal new-project card is disabled while garment selection still works', async () => {
  const traceTypes = [];
  let uploads = 0;
  const h = await component('NewProjectModal', { expand: true });
  const nodes = elements(h.render({ show: true, traceType: 'mockup_erase', setTraceType: value => traceTypes.push(value), onSelectImage: () => uploads++ }));
  const universal = nodes.find(node => node.type === 'button' && node.props['aria-label']?.includes('Universal'));
  assert.equal(universal.props.disabled, true); assert.match(textContent(universal), /Unavailable/);
  assert.ok(textContent(universal).includes(availability.UNIVERSAL_UNAVAILABLE_MESSAGE));
  universal.props.onClick();
  assert.deepEqual(h.changes, []); assert.deepEqual(traceTypes, []); assert.equal(uploads, 0);
  nodes.find(node => node.type === 'button' && node.props['aria-label']?.startsWith('Garment')).props.onClick();
  assert.deepEqual(traceTypes, ['mockup_erase']);
});

test('stale Universal category or trace state cannot expose an active create action', async () => {
  let uploads = 0;
  for (const options of [{ initialCategory: 'universal' }, { states: ['details', 'universal'], initialCategory: 'garment' }]) {
    const h = await component('NewProjectModal', { expand: true, states: options.states });
    const nodes = elements(h.render({ show: true, initialCategory: options.initialCategory, traceType: 'universal_preserve', onSelectImage: () => uploads++ }));
    assert.equal(nodes.some(node => node.type === 'button' && /Create.*→/.test(textContent(node))), false);
  }
  const stale = await component('NewProjectModal', { expand: true });
  const nodes = elements(stale.render({ show: true, initialCategory: 'garment', traceType: 'universal_erase', onSelectImage: () => uploads++ }));
  const create = nodes.find(node => node.type === 'button' && /Select Image.*Create/.test(textContent(node)));
  assert.equal(create.props.disabled, true); create.props.onClick(); assert.equal(uploads, 0);
  const garment = await component('NewProjectModal', { expand: true });
  const active = elements(garment.render({ show: true, initialCategory: 'garment', traceType: 'mockup_erase', onSelectImage: () => uploads++ }))
    .find(node => node.type === 'button' && /Select Image.*Create/.test(textContent(node)));
  assert.equal(active.props.disabled, false); active.props.onClick(); assert.equal(uploads, 1);
});

async function startScreen(traceType = 'mockup_erase') {
  const events = { clicks: 0, errors: [], compressed: 0, uploaded: 0, created: [], navigated: [] };
  const refs = [];
  const h = await component('StartScreen', { traceType, context: {
    useRouter: () => ({ push: path => events.navigated.push(path) }),
    createClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: 'token' } } }) } }),
    useRef(initial) {
      const ref = { current: initial === null ? { click: () => events.clicks++ } : initial };
      if (refs.length === 2) ref.current = 'universal';
      refs.push(ref); return ref;
    },
    toast: { error: message => events.errors.push(message) },
    CREDIT_PLANS: { tingi: { price: 'price' } }, trackEvent() {},
    compressImageClientSide: async file => { events.compressed++; return file; },
    uploadImageToStorage: async () => { events.uploaded++; return 'https://storage.test/file.png'; },
    fetchWithAuthRetry: async (_url, init) => { events.created.push(JSON.parse(init.body)); return { response: { ok: true } }; },
    readApiResponse: async () => ({ projectId: 'new-project' }),
  } });
  const tree = h.render({ workspaceRoute: true, initialUser: { id: 'user' } });
  return { tree, nodes: elements(tree), refs, events };
}

test('stale sidebar, selected file, modal upload and dropped-file routes cannot launch Universal', async () => {
  const h = await startScreen('universal_preserve');
  const file = { name: 'design.png', type: 'image/png', size: 100 };
  h.nodes.find(node => node.type === 'WorkspaceSidebar').props.onOpenFeature('universal');
  h.nodes.find(node => node.type === 'input' && node.props.ref === h.refs[1]).props.onChange({ target: { files: [file], value: 'old' } });
  h.nodes.find(node => node.type === 'NewProjectModal').props.onSelectImage();
  h.tree.props.onDrop({ preventDefault() {}, dataTransfer: { files: [file] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.events.clicks, 0); assert.equal(h.events.compressed, 0); assert.equal(h.events.uploaded, 0);
  assert.deepEqual(h.events.created, []); assert.deepEqual(h.events.navigated, []);
  assert.equal(h.events.errors.length, 4);
  assert.ok(h.events.errors.every(message => message === availability.UNIVERSAL_UNAVAILABLE_MESSAGE));
});

test('garment creation and Logo Studio launch retain their existing routes', async () => {
  const h = await startScreen();
  const file = { name: 'jersey.png', type: 'image/png', size: 100 };
  h.tree.props.onDrop({ preventDefault() {}, dataTransfer: { files: [file] } });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.events.uploaded, 1); assert.equal(h.events.created[0].traceType, 'mockup_erase');
  assert.deepEqual(h.events.navigated, ['/workspace/new-project']);
  h.nodes.find(node => node.type === 'WorkspaceSidebar').props.onOpenFeature('logo');
  assert.deepEqual(h.events.navigated, ['/workspace/new-project', '/logo-studio']);
});
