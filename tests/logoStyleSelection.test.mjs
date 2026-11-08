import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreLogoStyleSelection, switchLogoStyleMode } from '../src/app/logo-studio/styleSelection.mjs';
import { IMAGE_LOGO_STYLES, isLogoStyleAvailable } from '../src/lib/logoStyleCapabilities.mjs';
import { LOGO_STYLES, validateLogoOperation } from '../src/lib/logoStudio.mjs';
import { logoDesignFields, normalizeLogoDesignSettings } from '../src/lib/logoDesignSettings.mjs';
import { nanoLogoPlan } from '../src/lib/logoFal.mjs';
import { logoUsesNano } from '../src/lib/logoModelRouting.mjs';

test('Streetwear survives a Text → Image → Sketch → Text round trip with compatible fallbacks', () => {
  let selection = restoreLogoStyleSelection({ mode: 'text', style: 'streetwear-lettering' });
  selection = switchLogoStyleMode(selection, 'image');
  assert.equal(selection.style, 'minimalist');
  selection = switchLogoStyleMode(selection, 'sketch');
  assert.equal(selection.style, 'minimalist');
  selection = switchLogoStyleMode(selection, 'text');
  assert.equal(selection.style, 'streetwear-lettering');
});

test('reloading a reference-mode draft retains the remembered text style', () => {
  const selection = switchLogoStyleMode(restoreLogoStyleSelection({ style: 'streetwear-lettering' }), 'image');
  const restored = restoreLogoStyleSelection(JSON.parse(JSON.stringify(selection)));
  assert.equal(restored.style, 'minimalist');
  assert.equal(switchLogoStyleMode(restored, 'text').style, 'streetwear-lettering');
});

test('incompatible old drafts are normalized without losing their lettering selection', () => {
  for (const mode of ['image', 'sketch']) {
    const restored = restoreLogoStyleSelection({ mode, style: 'streetwear-lettering' });
    assert.equal(restored.style, mode === 'image' ? 'minimalist' : 'wordmark');
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

test('Image exposes nine subject styles and matching controls while Text and Sketch keep their full catalogs', () => {
  assert.equal(IMAGE_LOGO_STYLES.length, 9);
  assert.equal(LOGO_STYLES.filter(style => isLogoStyleAvailable(style.id, 'text')).length, 13);
  assert.equal(LOGO_STYLES.filter(style => isLogoStyleAvailable(style.id, 'sketch')).length, 12);
  for (const style of IMAGE_LOGO_STYLES) {
    const settings = normalizeLogoDesignSettings({ fontFamily: 'sans', monogramLetters: 'AB', streetwearDepth: 'flat', mood: 'friendly' }, style, { mode: 'image' });
    assert.deepEqual(settings, { mood: 'friendly' });
    assert.ok(logoDesignFields(style, { mode: 'image' }).every(([key]) => !/^(?:font|letter|monogram|streetwear)|^composition$|^capitalization$/.test(key)));
    const request = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'image', style, prompt: '', sourceUrl: 'https://storage.test/image.png', designSettings: settings });
    assert.equal(logoUsesNano(request), true);
    assert.equal(nanoLogoPlan(request, request.sourceUrl).endpoint, 'google/nano-banana-2.1/edit');
  }
});

test('old incompatible Image drafts normalize safely and retain their Text style', () => {
  for (const style of ['monogram', 'wordmark', 'abstract', 'streetwear-lettering']) {
    const image = restoreLogoStyleSelection({ mode: 'image', style, stylesByMode: { image: style } });
    assert.equal(image.style, 'minimalist');
    assert.equal(switchLogoStyleMode(image, 'text').style, style);
  }
});
