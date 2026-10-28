import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LOGO_EXAMPLES } from '../src/lib/logoExamples.mjs';
import { LOGO_STYLES } from '../src/lib/logoStudio.mjs';

test('example gallery provides forty-two unique, usable logo briefs', () => {
  assert.equal(LOGO_EXAMPLES.length, 42);
  assert.equal(new Set(LOGO_EXAMPLES.map(item => item.id)).size, 42);
  for (const item of LOGO_EXAMPLES) {
    assert.ok(LOGO_STYLES.some(style => style.id === item.style));
    assert.ok(item.prompt.length > 20);
    assert.ok(item.style !== 'wordmark' || item.brand.length > 0);
    assert.equal(item.image, `/images/logo-examples/studio-${item.id}.webp`);
    assert.ok(existsSync(new URL(`../public${item.image}`, import.meta.url)), `Missing preview for ${item.id}`);
  }
});
