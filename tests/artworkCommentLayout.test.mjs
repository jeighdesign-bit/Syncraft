import test from 'node:test';
import assert from 'node:assert/strict';
import { artworkCommentLayout } from '../src/lib/artworkCommentLayout.mjs';

test('a desktop note appears beside its point on centered, letterboxed artwork', () => {
  const result = artworkCommentLayout(
    { x: 0.5, y: 0.5 },
    { width: 400, height: 720 },
    { width: 1600, height: 720 },
  );
  assert.deepEqual(result, { left: 824, top: 338, width: 296 });
});

test('notes near the right edge flip to the left of their pin', () => {
  const result = artworkCommentLayout(
    { x: 0.95, y: 0.5 },
    { width: 600, height: 600 },
    { width: 640, height: 600 },
  );
  assert.ok(result.left + result.width < 590);
  assert.equal(result.top, 278);
});

test('mobile notes move below the pin, or above it near the bottom edge', () => {
  const artwork = { width: 330, height: 600 };
  const viewport = { width: 342, height: 600 };
  assert.equal(artworkCommentLayout({ x: 0.5, y: 0.5 }, artwork, viewport).top, 324);
  assert.equal(artworkCommentLayout({ x: 0.5, y: 0.99 }, artwork, viewport).top, 526);
});

test('resizing and corner pins keep the entire editor inside the preview', () => {
  for (const width of [280, 342, 768, 1920]) {
    for (const height of [180, 600]) {
      for (const x of [0, 0.5, 1]) {
        for (const y of [0, 0.5, 1]) {
          const result = artworkCommentLayout(
            { x, y },
            { width: Math.min(width, 400), height },
            { width, height },
          );
          assert.ok(result.left >= 12 && result.top >= 12);
          assert.ok(result.left + result.width <= width - 12);
          assert.ok(result.top + 44 <= height - 12);
        }
      }
    }
  }
  assert.equal(
    artworkCommentLayout(null, { width: 400, height: 600 }, { width: 0, height: 0 }),
    null,
  );
});
