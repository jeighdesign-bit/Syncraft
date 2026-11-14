import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import * as expiry from '../src/lib/qrExpiry.mjs';
import { CREDIT_PLANS } from '../src/lib/paymentPlans.js';
import { B2B_CREDIT_PLANS } from '../src/lib/b2bPaymentPlans.js';

const epoch = Date.parse('2026-11-10T03:00:00Z');

test('QR expiry uses the provider timestamp and fails closed for an unknown expiry', () => {
  for (const value of [new Date(epoch).toISOString(), epoch, epoch / 1000, String(epoch / 1000)]) {
    assert.equal(expiry.qrExpiryTimestamp(value), epoch);
    assert.equal(expiry.qrExpiryState(value, epoch - 61_000).label, '01:01');
    assert.equal(expiry.qrExpiryState(value, epoch - 1).label, '00:01');
    assert.equal(expiry.qrExpiryState(value, epoch).expired, true);
    assert.equal(expiry.qrExpiryState(value, epoch + 60_000).label, '00:00');
  }
  for (const value of [null, undefined, '', 'invalid', 0, NaN]) {
    assert.equal(expiry.qrExpiryState(value, epoch).expired, true);
  }
});

// Exercise both real modal components and the real countdown hook with a fake
// clock/network. No live checkout, payment, account, or credit changes are made.
async function checkoutHarness(kind, options = {}) {
  let now = epoch, timerId = 0, stateIndex = 0, refIndex = 0, effectIndex = 0;
  let dirty = true, tree, providerStatus = 'pending', generation = 0, paidCalls = 0;
  const timers = new Map(), states = [], refs = [], effects = [], pending = [], requests = [];
  const events = () => {
    const handlers = new Map();
    return {
      addEventListener: (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
      removeEventListener: (type, fn) => handlers.get(type)?.delete(fn),
      dispatchEvent: event => { for (const fn of handlers.get(event.type) || []) fn(event); },
      count: () => [...handlers.values()].reduce((sum, set) => sum + set.size, 0),
    };
  };
  const window = events(), document = { ...events(), body: { style: {} } };
  const react = {
    memo: fn => fn,
    useState(initial) {
      const i = stateIndex++;
      if (!(i in states)) states[i] = typeof initial === 'function' ? initial() : initial;
      return [states[i], value => {
        const next = typeof value === 'function' ? value(states[i]) : value;
        if (!Object.is(next, states[i])) { states[i] = next; dirty = true; }
      }];
    },
    useRef(initial) { return refs[refIndex++] ||= { current: initial }; },
    useCallback: fn => fn,
    useEffect(fn, deps) {
      const i = effectIndex++, old = effects[i];
      if (!old || deps.some((value, j) => !Object.is(value, old.deps[j]))) {
        pending.push(() => { old?.cleanup?.(); effects[i] = { deps, cleanup: fn() }; });
      }
    },
  };
  const jsx = (type, props) => ({ type, props });
  const empty = { __esModule: true, default: () => null };
  const supabase = { auth: { getSession: async () => ({ data: { session: { access_token: 'test-token' } } }) } };
  const dependencies = {
    react, 'react/jsx-runtime': { jsx, jsxs: jsx, Fragment: 'fragment' },
    'lucide-react': new Proxy({}, { get: (_, key) => String(key) }),
    '@/lib/qrExpiry.mjs': expiry, '@/lib/paymentPlans': { CREDIT_PLANS },
    '@/lib/b2bPaymentPlans': { B2B_CREDIT_PLANS },
    '@/utils/supabase/client': { createClient: () => supabase },
    '@/lib/paymentMethods.mjs': { MANUAL_GCASH_ENABLED: false },
    '@/lib/analytics.mjs': { trackEvent() {} },
    '@/components/Toast': { toast: { success() {}, error() {} } },
    '@/app/components/PricingSection': empty, './CreditHistory': empty,
  };
  const setTimeout = (fn, ms) => { const id = ++timerId; timers.set(id, { fn, at: now + ms }); return id; };
  const clearTimeout = id => timers.delete(id);
  const fetch = async (url, init) => {
    requests.push({ url, init });
    if (url.endsWith('/checkout')) {
      generation++;
      const result = {
        localPaymentId: `payment-${generation}`, paymentId: `payment-${generation}`,
        qrBase64: `data:image/png;base64,qr-${generation}`,
        expiresAt: options.missingExpiry ? null : new Date(now + 5000).toISOString(),
        plan: B2B_CREDIT_PLANS.pro,
      };
      if (options.deferCheckout) return options.deferCheckout(result);
      return Response.json(result);
    }
    if (options.deferStatus) return options.deferStatus();
    return Response.json(kind === 'consumer' ? { status: providerStatus } : { payment: { status: providerStatus } });
  };
  class ClockDate extends Date { static now() { return now; } }
  const context = vm.createContext({
    Date: ClockDate, window, document, setTimeout, clearTimeout, fetch, AbortController,
    CustomEvent: class { constructor(type) { this.type = type; } }, console,
    process: { env: {} },
  });
  async function load(path) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { fileName: 'component.jsx', compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} };
    context.module = module; context.exports = module.exports;
    context.require = name => name.endsWith('.css')
      ? { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      : dependencies[name] || (() => { throw new Error(`Unmocked import: ${name}`); })();
    vm.runInContext(`(function(){${code}\n})()`, context);
    return module.exports;
  }
  dependencies['@/components/CreditAmount'] = await load('../src/components/CreditAmount.js');
  dependencies['@/hooks/useQrExpiry'] = await load('../src/hooks/useQrExpiry.js');
  const Component = (await load(kind === 'consumer' ? '../src/components/TopUpModal.js' : '../src/app/api-dashboard/ApiCreditTopUpModal.js')).default;
  const props = {
    show: true, open: true, initialPlanKey: 'tingi', initialStep: 2,
    user: { id: 'customer', email: 'customer@example.com' }, supabase,
    onClose: () => { props.show = props.open = false; dirty = true; },
    onCreditUpdated: () => paidCalls++, onPaid: () => paidCalls++,
  };
  const render = () => {
    let passes = 0;
    while (dirty) {
      assert.ok(passes++ < 20, 'render stabilizes');
      dirty = false; stateIndex = refIndex = effectIndex = 0;
      tree = Component(props);
      for (const run of pending.splice(0)) run();
    }
    return tree;
  };
  const flush = async () => { for (let i = 0; i < 12; i++) { await new Promise(resolve => setImmediate(resolve)); render(); } };
  const findAll = predicate => {
    const found = [];
    const walk = node => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== 'object') return;
      if (predicate(node)) found.push(node);
      walk(node.props?.children);
    };
    walk(render()); return found;
  };
  const text = node => Array.isArray(node) ? node.map(text).join('') : node && typeof node === 'object' ? text(node.props?.children) : node == null || node === false ? '' : String(node);
  const button = label => findAll(node => node.type === 'button' && (text(node).includes(label) || node.props['aria-label'] === label))[0];
  const click = async label => { const node = button(label); assert.ok(node, `button exists: ${label}`); await node.props.onClick(); await flush(); };
  render();
  return {
    render, flush, findAll, text: () => text(render()), click, button, props, requests, timers, window, document,
    get paidCalls() { return paidCalls; },
    setStatus(value) { providerStatus = value; },
    async start() { await click(kind === 'consumer' ? 'QR Ph (GCash & Maya)' : 'Continue to QR Ph'); },
    async advance(ms, throttled = false) {
      const end = now + ms;
      if (throttled) { now = end; window.dispatchEvent({ type: 'focus' }); await flush(); return; }
      for (;;) {
        const next = [...timers.entries()].filter(([, value]) => value.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = Math.max(now, next[1].at); timers.delete(next[0]); next[1].fn(); await flush();
      }
      now = end; await flush();
    },
    unmount() { for (const effect of effects) effect?.cleanup?.(); },
  };
}

for (const kind of ['consumer', 'api']) {
  const qrImages = h => h.findAll(node => node.type === 'img' && node.props.src.startsWith('data:'));

  test(`${kind}: countdown removes the QR exactly at expiry and regenerates a fresh code`, async () => {
    const h = await checkoutHarness(kind); await h.start();
    assert.equal(qrImages(h).length, 1); assert.match(h.text(), /00:05/);
    await h.advance(1000); assert.match(h.text(), /00:04/);
    await h.advance(4000);
    assert.equal(qrImages(h).length, 0); assert.match(h.text(), /QR expired/);
    assert.match(h.text(), /do not pay again/i); assert.match(h.text(), /00:00/);
    await h.click('Generate new QR');
    assert.equal(qrImages(h)[0].props.src, 'data:image/png;base64,qr-2');
    assert.match(h.text(), /00:05/); h.unmount();
  });

  test(`${kind}: a background tab cannot revive an expired QR on focus`, async () => {
    const h = await checkoutHarness(kind); await h.start();
    await h.advance(35_000, true);
    assert.equal(qrImages(h).length, 0); assert.match(h.text(), /QR expired/); h.unmount();
  });

  test(`${kind}: a paid confirmation after expiry still succeeds once`, async () => {
    const h = await checkoutHarness(kind); await h.start(); await h.advance(5000);
    h.setStatus('paid'); await h.advance(1000);
    assert.equal(h.paidCalls, 1); assert.equal(qrImages(h).length, 0);
    assert.match(h.text(), /Payment (completed|complete)|Credits added/i);
    await h.advance(12_000); assert.equal(h.paidCalls, 1); h.unmount();
  });

  test(`${kind}: early provider expiry and missing expiry both block scanning`, async () => {
    const h = await checkoutHarness(kind); await h.start(); h.setStatus('expired'); await h.advance(3000);
    assert.equal(qrImages(h).length, 0); h.unmount();
    const missing = await checkoutHarness(kind, { missingExpiry: true }); await missing.start();
    assert.equal(qrImages(missing).length, 0); missing.unmount();
  });

  test(`${kind}: closing cancels pending checks, timers and countdown listeners`, async () => {
    let resolveStatus;
    const h = await checkoutHarness(kind, { deferStatus: () => new Promise(resolve => { resolveStatus = resolve; }) });
    await h.start();
    await h.click(kind === 'consumer' ? 'Close credits dialog' : 'Close API credit checkout');
    resolveStatus(Response.json(kind === 'consumer' ? { status: 'paid' } : { payment: { status: 'paid' } }));
    await h.flush();
    assert.equal(h.render(), null); assert.equal(h.paidCalls, 0);
    assert.equal(h.timers.size, 0); assert.equal(h.window.count(), 0); assert.equal(h.document.count(), 0); h.unmount();
  });

  test(`${kind}: a checkout response arriving after close cannot reopen the QR`, async () => {
    let resolveCheckout;
    const h = await checkoutHarness(kind, {
      deferCheckout: result => new Promise(resolve => { resolveCheckout = () => resolve(Response.json(result)); }),
    });
    const starting = h.start(); await h.flush();
    await h.click(kind === 'consumer' ? 'Close credits dialog' : 'Close API credit checkout');
    resolveCheckout(); await starting;
    assert.equal(h.render(), null); assert.equal(qrImages(h).length, 0);
    assert.equal(h.requests.filter(request => request.url.includes('/status')).length, 0); h.unmount();
  });

  test(`${kind}: confirmation checks stop after the expiry grace period`, async () => {
    const h = await checkoutHarness(kind); await h.start(); await h.advance(70_000);
    const checks = h.requests.length; await h.advance(20_000);
    assert.equal(h.requests.length, checks); assert.equal(h.timers.size, 0);
    assert.equal(qrImages(h).length, 0); h.unmount();
  });

  test(`${kind}: payment confirmation cancels an in-flight replacement QR`, async () => {
    let resolveReplacement;
    const h = await checkoutHarness(kind, {
      deferCheckout: result => result.localPaymentId === 'payment-1' ? Response.json(result)
        : new Promise(resolve => { resolveReplacement = () => resolve(Response.json(result)); }),
    });
    await h.start(); await h.advance(5000);
    const replacing = h.click('Generate new QR'); await h.flush();
    h.setStatus('paid'); await h.advance(1000);
    resolveReplacement(); await replacing;
    assert.equal(h.paidCalls, 1); assert.equal(qrImages(h).length, 0);
    assert.match(h.text(), /Payment (completed|complete)|Credits added/i); h.unmount();
  });
}
