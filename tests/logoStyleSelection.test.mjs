import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreLogoStyleSelection, switchLogoStyleMode } from '../src/app/logo-studio/styleSelection.mjs';

test('Streetwear survives a Text → Image → Sketch → Text round trip with compatible fallbacks', () => {
  let selection = restoreLogoStyleSelection({ mode: 'text', style: 'streetwear-lettering' });
  selection = switchLogoStyleMode(selection, 'image');
  assert.equal(selection.style, 'wordmark');
  selection = switchLogoStyleMode(selection, 'sketch');
  assert.equal(selection.style, 'wordmark');
  selection = switchLogoStyleMode(selection, 'text');
  assert.equal(selection.style, 'streetwear-lettering');
});

test('reloading a reference-mode draft retains the remembered text style', () => {
  const selection = switchLogoStyleMode(restoreLogoStyleSelection({ style: 'streetwear-lettering' }), 'image');
  const restored = restoreLogoStyleSelection(JSON.parse(JSON.stringify(selection)));
  assert.equal(restored.style, 'wordmark');
  assert.equal(switchLogoStyleMode(restored, 'text').style, 'streetwear-lettering');
});

test('incompatible old drafts are normalized without losing their lettering selection', () => {
  for (const mode of ['image', 'sketch']) {
    const restored = restoreLogoStyleSelection({ mode, style: 'streetwear-lettering' });
    assert.equal(restored.style, 'wordmark');
    assert.equal(switchLogoStyleMode(restored, 'text').style, 'streetwear-lettering');
  }
  const invalid = restoreLogoStyleSelection({ mode: 'bad-mode', style: 'bad-style', stylesByMode: { sketch: 'bad-style' } });
  assert.equal(invalid.mode, 'text');
  assert.equal(invalid.style, 'minimalist');
  assert.equal(invalid.stylesByMode.sketch, 'minimalist');
});

test('each mode retains a deliberate style choice independently', () => {
  const text = restoreLogoStyleSelection({ mode: 'text', style: 'streetwear-lettering', stylesByMode: { image: 'mascot' } });
  const image = switchLogoStyleMode(text, 'image');
  assert.equal(image.style, 'mascot');
  assert.equal(switchLogoStyleMode(image, 'text').style, 'streetwear-lettering');
});
