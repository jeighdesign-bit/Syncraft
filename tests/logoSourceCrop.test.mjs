import test from 'node:test';
import assert from 'node:assert/strict';
import { createLogoSourceCrop, logoSourceCropRegion } from '../src/lib/logoSourceCrop.mjs';

test('crop coordinates map to the original image, independent of preview size', () => {
  const crop = { unit: '%', x: 25, y: 10, width: 50, height: 70 };
  assert.deepEqual(logoSourceCropRegion(crop, 2400, 1600), { x: 600, y: 160, width: 1200, height: 1120 });
  assert.deepEqual(logoSourceCropRegion({ unit: '%', x: 90, y: 80, width: 20, height: 30 }, 100, 100), { x: 90, y: 80, width: 10, height: 20 });
  for (const invalid of [null, { ...crop, width: 0 }, { ...crop, height: NaN }, { ...crop, unit: 'px' }]) {
    assert.throws(() => logoSourceCropRegion(invalid, 2400, 1600), /Choose an area/);
  }
  assert.throws(() => logoSourceCropRegion(crop, 0, 0), /Choose an area/);
});

function canvasHarness(blobs = [new Blob(['png-data'], { type: 'image/png' })]) {
  const draws = [];
  const encodings = [];
  const canvas = { width: 0, height: 0,
    getContext: type => { assert.equal(type, '2d'); return { drawImage: (...args) => draws.push(args) }; },
    toBlob: (callback, type) => { encodings.push(type); callback(blobs.shift()); },
  };
  return { canvas, draws, encodings };
}

test('only selected pixels are exported as the reference file and transparency is preserved with PNG', async () => {
  const image = { naturalWidth: 2400, naturalHeight: 1600 };
  const crop = { unit: '%', x: 25, y: 10, width: 50, height: 70 };
  const h = canvasHarness();
  const result = await createLogoSourceCrop(image, crop, 'portrait.jpg', () => h.canvas);
  assert.deepEqual(h.draws[0], [image, 600, 160, 1200, 1120, 0, 0, 1200, 1120]);
  assert.deepEqual(h.encodings, ['image/png']);
  assert.equal(result.name, 'portrait-crop.png');
  assert.equal(result.type, 'image/png');
  assert.equal(await result.text(), 'png-data');
});

test('large crops retain aspect ratio and resize until they fit the existing upload limit', async () => {
  const h = canvasHarness([new Blob([new Uint8Array(4 * 1024 * 1024 + 1)]), new Blob(['smaller-png'])]);
  await createLogoSourceCrop({ naturalWidth: 6000, naturalHeight: 3000 }, { unit: '%', x: 0, y: 0, width: 100, height: 100 }, 'wide.webp', () => h.canvas);
  assert.deepEqual(h.draws.map(args => args.slice(-2)), [[2048, 1024], [1536, 768]]);
});

test('failed browser encoding surfaces an error instead of replacing the source', async () => {
  const image = { naturalWidth: 100, naturalHeight: 100 };
  const crop = { unit: '%', x: 10, y: 10, width: 80, height: 80 };
  const h = canvasHarness([null]);
  await assert.rejects(createLogoSourceCrop(image, crop, 'photo.png', () => h.canvas), /Could not crop/);
  await assert.rejects(createLogoSourceCrop(image, crop, 'photo.png', () => ({ getContext: () => null })), /Cropping is unavailable/);
});
