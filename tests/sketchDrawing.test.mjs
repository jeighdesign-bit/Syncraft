import test from 'node:test';
import assert from 'node:assert/strict';
import { floodFillSketchPixels, mirroredSketchPositions, smoothSketchPoints } from '../src/app/logo-studio/sketchDrawing.mjs';

test('smoothing keeps stroke endpoints and softens a sharp middle point', () => {
  const points = [[0, 0], [10, 0], [20, 20], [30, 0], [40, 0]];
  const result = smoothSketchPoints(points, 50);
  assert.deepEqual(result[0], points[0]);
  assert.deepEqual(result.at(-1), points.at(-1));
  assert.ok(result[2][1] > 0 && result[2][1] < 20);
  assert.deepEqual(smoothSketchPoints(points, 0), points);
});

test('symmetry mirrors around the canvas center without duplicate positions', () => {
  assert.deepEqual(mirroredSketchPositions(100, 150, true, true), [[100, 150], [500, 150], [100, 450], [500, 450]]);
  assert.deepEqual(mirroredSketchPositions(300, 300, true, true), [[300, 300]]);
});

test('fill stays inside a closed border', () => {
  const width = 5; const height = 5;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    const value = x === 1 || x === 3 || y === 1 || y === 3 ? 0 : 255;
    pixels.set([value, value, value, 255], offset);
  }
  assert.equal(floodFillSketchPixels(pixels, width, height, 2, 2, [255, 0, 0, 255]), true);
  assert.deepEqual([...pixels.slice((2 * width + 2) * 4, (2 * width + 2) * 4 + 4)], [255, 0, 0, 255]);
  assert.deepEqual([...pixels.slice(0, 4)], [255, 255, 255, 255]);
  assert.equal(floodFillSketchPixels(pixels, width, height, 2, 2, [255, 0, 0, 255]), false);
});
