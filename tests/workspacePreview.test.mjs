import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { canvasImageUrl, canvasZoomLayout, comparePreviewLayout, preferredCanvasTab, previewProxyUrl, svgPreviewUrl } from '../src/lib/workspacePreview.mjs';

test('display derivatives preserve the complete source URL and do not modify the editor URL', () => {
  const source = '/api/proxy?url=https%3A%2F%2Fstorage.test%2Flarge.png%3Ftoken%3Da%26b%3Dc';
  assert.equal(previewProxyUrl(source), `${source}&preview=1`);
  assert.equal(new URL(previewProxyUrl(source), 'https://app.test').searchParams.get('url'), 'https://storage.test/large.png?token=a&b=c');
  assert.equal(source.includes('preview='), false);
  assert.equal(previewProxyUrl(null), null);
});

test('SVG canvas preview flags preserve the vector source URL for full-detail downloads', () => {
  const source = '/api/proxy?url=https%3A%2F%2Fstorage.test%2Fvector.svg';
  assert.equal(svgPreviewUrl(source), `${source}&preview=1&svgPreview=1`);
  assert.equal(new URL(svgPreviewUrl(source), 'https://app.test').searchParams.get('url'), 'https://storage.test/vector.svg');
  assert.equal(source.includes('preview='), false);
  assert.equal(svgPreviewUrl(null), null);
});

test('the HD canvas keeps the full-resolution proxy while ordinary previews use derivatives', () => {
  const source = '/api/proxy?url=https%3A%2F%2Fstorage.test%2Fupscaled.png';
  assert.equal(canvasImageUrl(source), `${source}&preview=1`);
  assert.equal(canvasImageUrl(source, { fullResolution: true }), source);
  assert.equal(canvasImageUrl(null, { fullResolution: true }), null);
});

test('fit is the minimum readable view and explicit zoom-in remains available', () => {
  for (const zoom of [0.25, 0.5, 0.75, 1]) {
    const { scrollPercent, contentScale } = canvasZoomLayout(zoom);
    assert.equal(scrollPercent, 100);
    assert.equal(contentScale, 1);
    assert.equal((800 * scrollPercent / 100) * contentScale, 800);
  }
  assert.deepEqual(canvasZoomLayout(2), { scrollPercent: 200, contentScale: 1 });
  assert.deepEqual(canvasZoomLayout(Number.NaN), { scrollPercent: 100, contentScale: 1 });
});

test('completed generation opens HD Upscale first even when the SVG is available', () => {
  assert.equal(preferredCanvasTab({ svg_url: 'vector', upscaled_image_url: 'large-raster' }), 'upscaled');
  assert.equal(preferredCanvasTab({ svg_url: 'vector' }), 'svg');
  assert.equal(preferredCanvasTab({ upscaled_image_url: 'raster' }), 'upscaled');
  assert.equal(preferredCanvasTab({ generated_image_url: 'flat' }), 'generated');
  assert.equal(preferredCanvasTab({ trace_type: 'upscale', svg_url: 'legacy-vector' }), 'generated');
});

test('comparison layers use the same centered cover crop without letterboxing', () => {
  const regular = comparePreviewLayout(0.52);
  assert.equal(regular.rotateTallPreview, false);
  assert.equal(regular.previewAspect, 0.52);
  assert.equal(regular.imageStyle.objectFit, 'cover');
  assert.equal(regular.imageStyle.objectPosition, 'center');
  assert.equal(regular.imageStyle.width, '100%');
  assert.equal(regular.imageStyle.height, '100%');

  const tall = comparePreviewLayout(0.25);
  assert.equal(tall.rotateTallPreview, false);
  assert.equal(tall.previewAspect, 0.25);
  assert.equal(tall.imageStyle.objectFit, 'cover');
  assert.equal(tall.imageStyle.transform, undefined);
});

async function rasterHarness() {
  const source = (await readFile(new URL('../src/app/workspace/[id]/components/SplitViewCanvas.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?;\r?\n/gm, '').replace(/^export default SplitViewCanvas;?\r?\n?/m, '');
  const compiled = ts.transpileModule(source, { fileName: 'SplitViewCanvas.jsx', compilerOptions: {
    jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  } }).outputText;
  const states = [], effects = [], timers = new Map();
  let cursor = 0, timerId = 0;
  const context = vm.createContext({
    React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) },
    memo: component => component,
    useState: initial => {
      const index = cursor++;
      if (!(index in states)) states[index] = initial;
      return [states[index], next => { states[index] = typeof next === 'function' ? next(states[index]) : next; }];
    },
    useEffect: effect => effects.push(effect),
    setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const { RasterPreview } = vm.runInContext(`${compiled}\n({RasterPreview})`, context);
  return { timers, effects, render(props = {}) {
    cursor = 0; effects.length = 0;
    const tree = RasterPreview({ url: '/api/proxy?url=image&preview=1', alt: 'Output', style: { objectFit: 'contain' }, ...props });
    return { tree, image: tree.props.children[0], feedback: tree.props.children[1] };
  } };
}

test('a partial raster remains hidden until its complete load event', async () => {
  const h = await rasterHarness();
  let view = h.render();
  assert.equal(view.image.props.style.visibility, 'hidden');
  assert.equal(view.tree.props['aria-busy'], true);
  view.image.props.onLoad({ currentTarget: { naturalWidth: 893, naturalHeight: 1600 } });
  view = h.render();
  assert.equal(view.image.props.style.visibility, 'visible');
  assert.equal(view.feedback, false);
  assert.equal(view.tree.props['aria-busy'], false);
});

test('failed raster loads expose retry while preserving display-only URLs', async () => {
  const h = await rasterHarness();
  let view = h.render();
  view.image.props.onError();
  view = h.render();
  assert.equal(view.feedback.props.error, true);
  assert.equal(view.image.props.style.visibility, 'hidden');
  view.feedback.props.onRetry();
  view = h.render();
  assert.match(view.image.props.src, /preview=1&preview_retry=1$/);
  assert.equal(view.feedback.props.error, false);
});

test('changing the preview source never flashes the previous loaded image', async () => {
  const h = await rasterHarness();
  const old = h.render();
  old.image.props.onLoad({ currentTarget: { naturalWidth: 800, naturalHeight: 1600 } });
  let view = h.render({ url: '/api/proxy?url=new&preview=1' });
  assert.equal(view.image.props.style.visibility, 'hidden');
  old.image.props.onLoad({ currentTarget: { naturalWidth: 800, naturalHeight: 1600 } });
  view = h.render({ url: '/api/proxy?url=new&preview=1' });
  assert.equal(view.image.props.style.visibility, 'hidden');
});

test('a stalled preview times out into retry feedback and its timer can be cancelled', async () => {
  const h = await rasterHarness(); h.render();
  const cleanup = h.effects[0]();
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].ms, 45_000);
  [...h.timers.values()][0].callback();
  assert.equal(h.render().feedback.props.error, true);
  cleanup();
  assert.equal(h.timers.size, 0);
});
