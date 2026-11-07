import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LOGO_EXAMPLES } from '../src/lib/logoExamples.mjs';
import { LOGO_STYLES } from '../src/lib/logoStudio.mjs';
import { requiresLogoBrand } from '../src/lib/logoStyleCapabilities.mjs';
import { LOGO_EXAMPLE_ADDITIONS } from '../src/lib/logoExampleAdditions.mjs';
import { LOGO_EXAMPLE_REFRESH } from '../src/lib/logoExampleRefresh.mjs';
import { LOGO_EXAMPLE_FEATURED } from '../src/lib/logoExampleFeatured.mjs';

test('example gallery keeps usable briefs, lettering controls and local previews', () => {
  assert.equal(new Set(LOGO_EXAMPLES.map(item => item.id)).size, LOGO_EXAMPLES.length);
  assert.ok(LOGO_EXAMPLES.some(item => item.style === 'streetwear-lettering'));
  for (const item of LOGO_EXAMPLES) {
    assert.ok(LOGO_STYLES.some(style => style.id === item.style));
    assert.ok(item.prompt.length > 20 || (item.style === 'streetwear-lettering' && item.brand && item.designSettings.streetwearLetters));
    assert.ok(!requiresLogoBrand(item.style) || item.brand.length > 0);
    const imagePath = item.image.split('?')[0];
    assert.equal(imagePath, `/images/logo-examples/studio-${item.id}.webp`);
    assert.ok(existsSync(new URL(`../public${imagePath}`, import.meta.url)), `Missing preview for ${item.id}`);
  }
});

test('retired gallery-derived examples stay unpublished while DARKMEN streetwear stays available', () => {
  assert.equal(LOGO_EXAMPLES.length, 22);
  assert.ok(LOGO_EXAMPLES.every(item => item.id.startsWith('original-') || item.id.startsWith('darkmen-')));
  assert.equal(LOGO_EXAMPLES.some(item => item.id.startsWith('recent-')), false);
  const darkmen = LOGO_EXAMPLES.filter(item => item.id.startsWith('darkmen-'));
  assert.equal(darkmen.length, 10);
  assert.ok(darkmen.every(item => item.style === 'streetwear-lettering' && item.brand === 'DARKMEN' && item.tagline === 'ENTERPRISE'));
  const retiredBrands = new Set(['AGIO BULLS', 'FORBIDDEN CULT', 'old bannie s pub&pizzaria', 'massawa restaurant',
    'DUSKVALE', 'FERNTHREAD', 'SUNDAY SPORE', 'BRIMBOP', 'PRISMFOLD', 'CINDERMOTH', 'ZIPPEAR', 'NOTCHFOLD']);
  assert.equal(LOGO_EXAMPLES.some(item => retiredBrands.has(item.brand)), false);
  for (const retired of [...LOGO_EXAMPLE_ADDITIONS, ...LOGO_EXAMPLE_REFRESH, ...LOGO_EXAMPLE_FEATURED]) {
    assert.equal(LOGO_EXAMPLES.some(item => item.id === retired.id), false, `Retired preset still published: ${retired.id}`);
    assert.equal(existsSync(new URL(`../public${retired.image}`, import.meta.url)), false, `Retired preview still public: ${retired.id}`);
  }
});

test('the cartoon slot uses the user-approved capybara courier and matching controls', () => {
  const cartoon = LOGO_EXAMPLES.find(item => item.id === 'original-sunday-spore');
  assert.equal(cartoon.brand, 'PIPPARCEL');
  assert.equal(cartoon.style, 'cartoon');
  assert.match(cartoon.prompt, /capybara courier/);
  assert.equal(cartoon.designSettings.characterComposition, 'full-body');
  assert.equal(cartoon.designSettings.mood, 'cheerful');
  assert.equal(cartoon.designSettings.personality, 'playful');
  assert.match(cartoon.image, /\?v=.+/);
});

test('replacement marketing examples have independently authored briefs and distinct brand names', async () => {
  const { LOGO_ORIGINAL_CONCEPTS } = await import('../src/lib/logoOriginalConcepts.mjs');
  const replacements = LOGO_EXAMPLES.filter(item => item.id.startsWith('original-'));
  assert.equal(replacements.length, 12);
  assert.equal(new Set(replacements.map(item => item.brand)).size, 12);
  assert.equal(new Set(replacements.map(item => item.style)).size, 12);
  for (const item of replacements) {
    const brief = LOGO_ORIGINAL_CONCEPTS.find(concept => concept.id === item.id);
    assert.ok(brief);
    assert.equal(item.brand, brief.brand);
    assert.equal(item.tagline, brief.tagline);
    assert.equal(item.style, brief.style);
    assert.ok(item.prompt.length <= 300, `Public prompt is too long: ${item.id}`);
    assert.deepEqual(item.designSettings, brief.designSettings);
    assert.match(item.image, /\?v=.+/);
  }
});
