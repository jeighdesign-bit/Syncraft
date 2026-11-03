import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_STYLES, buildLogoPrompt, validateLogoOperation } from '../src/lib/logoStudio.mjs';
import { logoVariationSource, applyLogoVariationStyle, planLogoVariation, compileLogoVariation } from '../src/lib/logoVariations.mjs';

test('Auto is the default and explicit variation styles are allowlisted', () => {
  const request = { requestId: crypto.randomUUID(), sourceId: crypto.randomUUID(), operation: 'variations', style: 'retro' };
  assert.equal(validateLogoOperation(request).variationStyle, 'auto');
  for (const { id } of LOGO_STYLES) assert.equal(validateLogoOperation({ ...request, variationStyle: id }).variationStyle, id);
  for (const variationStyle of ['', 'unknown', {}, [], 1]) assert.throws(() => validateLogoOperation({ ...request, variationStyle }), /variation style/);
  assert.equal(validateLogoOperation({ requestId: crypto.randomUUID(), prompt: 'A bird', variationStyle: 'unknown' }).variationStyle, undefined);
});

test('Auto follows the accepted image while explicit styles override rendering without dropping identity', () => {
  const context = { style: 'retro', brand: 'Night Flight', prompt: 'Halloween pug with goggles and pumpkin charm', designSettings: {} };
  const auto = applyLogoVariationStyle(context);
  assert.equal(auto.style, 'retro'); assert.equal(auto.variationStyle, 'auto');
  assert.match(compileLogoVariation(auto), /AUTO STYLE: visually match/);
  for (const { id: style } of LOGO_STYLES) {
    const changed = applyLogoVariationStyle(context, style);
    assert.equal(changed.style, style); assert.equal(changed.sourceStyle, 'retro');
    const prompt = compileLogoVariation(changed);
    assert.match(prompt, /CHANGE STYLE:/);
    assert.match(prompt, /Target construction rules:/);
    assert.match(prompt, /exact text or important motifs/);
    assert.match(prompt, /goggles and pumpkin charm/);
    assert.doesNotMatch(prompt, /AUTO STYLE:|Do not impose a different illustration style/);
    assert.equal(planLogoVariation(changed).directionId.startsWith(['wordmark', 'monogram'].includes(style) ? 'lettering-' : ['mascot', 'retro', 'cartoon'].includes(style) ? 'character-' : 'symbol-'), true);
  }
});

test('changed lettering styles require saved text and derive initials only from the saved brand', () => {
  const symbol = { style: 'retro', brand: '', designSettings: {} };
  assert.throws(() => applyLogoVariationStyle(symbol, 'wordmark'), /saved brand text/);
  assert.throws(() => applyLogoVariationStyle(symbol, 'monogram'), /saved brand text or initials/);
  assert.throws(() => applyLogoVariationStyle(symbol, 'unknown'), /supported variation style/);
  assert.equal(applyLogoVariationStyle({ ...symbol, brand: 'Night Flight' }, 'monogram').designSettings.monogramLetters, 'NF');
  assert.equal(applyLogoVariationStyle({ style: 'monogram', designSettings: { monogramLetters: 'WB' } }, 'monogram').designSettings.monogramLetters, 'WB');
});

test('variations bypass photo/sketch generation instructions in all modes and styles', () => {
  for (const mode of ['text', 'image', 'sketch']) for (const { id: style } of LOGO_STYLES) {
    const job = validateLogoOperation({ requestId: crypto.randomUUID(), sourceId: crypto.randomUUID(),
      operation: 'variations', mode, style, brand: 'Wildbrew', prompt: 'Halloween pug aviator with pumpkin charm and violet goggles' });
    const prompt = buildLogoPrompt(job);
    assert.match(prompt, /DEDICATED LOGO VARIATION/);
    assert.match(prompt, /Both the major silhouette\/construction AND the arrangement must change visibly/);
    assert.match(prompt, /seasonal\/theme details/);
    assert.match(prompt, /pumpkin charm and violet goggles/);
    assert.doesNotMatch(prompt, /MAIN SUBJECT|Sketch fidelity|Sketch interpretation|Image-to-wordmark construction/);
    assert.match(prompt, /supplied image is the authority/);
    assert.match(prompt, /not to repeat the original pose/);
  }
});

test('each family has distinct structural directions rather than color-only variations', () => {
  for (const style of ['retro', 'wordmark', 'monogram', 'abstract', 'badge']) {
    const plans = Array.from({ length: 4 }, (_, i) => planLogoVariation({ style }, i));
    for (const field of ['directionId', 'pose', 'composition']) assert.equal(new Set(plans.map(plan => plan[field])).size, 4);
    if (style === 'retro') assert.ok(plans.every(plan => plan.directionId.startsWith('character-')));
    if (['wordmark', 'monogram'].includes(style)) assert.ok(plans.every(plan => plan.directionId.startsWith('lettering-')));
    if (style === 'badge') assert.match(plans[1].composition, /badge enclosure/);
  }
});

test('edited and utility source lineage retains initials and colors without copying stale edit instructions', () => {
  const original = { id: 'original', operation: 'generate', mode: 'sketch', style: 'monogram', prompt: 'An owl integrated into WB',
    brand: '', palette: [], designSettings: { monogramLetters: 'WB', backgroundColor: '#123abc' } };
  const edited = { id: 'edited', sourceId: 'original', operation: 'edit', mode: 'text', style: 'monogram', prompt: 'Remove the star', designSettings: {} };
  const svg = { id: 'vector', sourceId: 'edited', operation: 'vectorize', designSettings: {} };
  const context = logoVariationSource(svg, [original, edited, svg]);
  assert.equal(context.style, 'monogram');
  assert.equal(context.designSettings.monogramLetters, 'WB');
  const prompt = compileLogoVariation(context);
  assert.match(prompt, /exact main letters are "WB"/);
  assert.match(prompt, /#123ABC/);
  assert.doesNotMatch(prompt, /Remove the star|plain white background/);
  const cycle = { ...original, sourceId: 'original' };
  assert.doesNotThrow(() => logoVariationSource(cycle, [cycle]));
});
