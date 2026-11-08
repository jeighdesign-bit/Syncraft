import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_STYLES, validateLogoOperation, buildLogoPrompt, logoOperationCost } from '../src/lib/logoStudio.mjs';
import { LOGO_STYLE_LANGUAGE, LOGO_STYLE_LANGUAGE_VERSION } from '../src/lib/logoStyleLanguage.mjs';
import { buildLogoEnhancerInput, LOGO_ENHANCER_VERSION } from '../src/lib/logoPromptEnhancer.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { recraftLogoPlan } from '../src/lib/logoRecraft.mjs';

const request = changes => validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text',
  style: 'pictorial', prompt: 'Two herons facing each other, no shield or extra symbols.', brand: 'TIDELINE', tagline: '', palette: [], designSettings: {}, ...changes });

test('every available Text style shares its construction vocabulary with the enhancer and all batch options', () => {
  assert.deepEqual(Object.keys(LOGO_STYLE_LANGUAGE).sort(), LOGO_STYLES.map(style => style.id).sort());
  for (const { id: style } of LOGO_STYLES) {
    const job = request({ style });
    const before = JSON.stringify(job);
    const payload = buildLogoEnhancerInput({ ...job, hasBrand: true, brand: 'DO NOT SEND THIS NAME' });
    const context = JSON.parse(payload.prompt);
    assert.equal(context.styleGuidanceVersion, LOGO_STYLE_LANGUAGE_VERSION);
    assert.equal(context.styleDirection, LOGO_STYLE_LANGUAGE[style].construction);
    assert.equal(context.enhancementFocus, LOGO_STYLE_LANGUAGE[style].enhancerFocus);
    assert.equal(context.idea, job.prompt);
    assert.doesNotMatch(JSON.stringify(payload), /DO NOT SEND THIS NAME|TIDELINE/);
    const brief = normalizeLogoBrief(job);
    for (const direction of fallbackLogoDirections(brief, 4)) {
      const prompt = compileLogoDirection(brief, direction);
      assert.ok(prompt.includes(context.styleDirection), style);
      assert.ok(prompt.includes(job.prompt));
      assert.ok(prompt.includes('"TIDELINE"'));
    }
    assert.equal(JSON.stringify(job), before); // No settings/brief mutation.
    assert.equal(recraftLogoPlan(job).model, 'recraftv4_1');
    assert.equal(logoOperationCost('generate'), 8);
    assert.equal(logoOperationCost('variations'), 6);
  }
});

test('an illustrated initial and a complete word retain distinct identities and exact copy with the same house idea', () => {
  const idea = 'A house with an open square body, triangular roof and spiral cut.';
  const mono = request({ style: 'monogram', prompt: idea, brand: '', designSettings: { monogramLetters: 'H', monogramTreatment: 'geometric', monogramFont: 'sans' } });
  const word = request({ style: 'wordmark', prompt: `"HOME" inspired by a house with a triangular roof.`, brand: '', designSettings: { fontFamily: 'sans' } });
  const initialPrompt = buildLogoPrompt(mono), wordPrompt = buildLogoPrompt(word);
  assert.match(initialPrompt, /PRIMARY VISIBLE CONTENT: the monogram letters "H"/);
  assert.match(initialPrompt, /shared stroke, outer contour or counter cut/);
  assert.match(initialPrompt, /Do not substitute a full wordmark/);
  assert.match(wordPrompt, /complete brand name clearly readable/);
  assert.match(wordPrompt, /Do not reduce the complete name to a single illustrated initial/);
  assert.match(wordPrompt, /Use the word or name supplied in the user brief/);
  assert.equal(word.brand, '');
  assert.ok(initialPrompt.indexOf('User brief') < initialPrompt.indexOf('Style construction'));
  assert.ok(wordPrompt.indexOf('Required design control') < wordPrompt.indexOf('Style construction'));
});

test('style guidance refines explicit choices without replacing technique, topology, framing, finish or genre', () => {
  const cases = [
    { style: 'monogram', designSettings: { monogramLetters: 'AV', monogramTreatment: 'dimensional', detail: 'minimal' }, check: /detail budget simplifies ornament, not the requested depth/ },
    { style: 'engraved', designSettings: { engravingTechnique: 'stipple', detail: 'minimal' }, check: /STIPPLE construction: build all tonal shading from separated ink dots/ },
    { style: 'abstract', prompt: 'Three closed interlocking loops, no extra shapes.', designSettings: { structure: 'geometric' }, check: /Three closed interlocking loops, no extra shapes/ },
    { style: 'mascot', prompt: 'A friendly octopus with eight arms, full body, no clothing.', designSettings: { characterComposition: 'full-body', detail: 'detailed' }, check: /eight arms, full body, no clothing/ },
    { style: 'line', prompt: 'A heron made of separate open contours.', designSettings: {}, check: /continuous path is appropriate only when requested or compatible/ },
    { style: 'streetwear-lettering', prompt: 'A calm flowing name, no symbols.', designSettings: { streetwearLetters: 'athletic-block', streetwearDepth: 'beveled' }, check: /geometric varsity block glyphs/ },
  ];
  for (const { check, ...changes } of cases) {
    const job = request(changes), prompt = buildLogoPrompt(job);
    assert.match(prompt, check);
    assert.deepEqual(normalizeLogoBrief(job).designSettings, job.designSettings);
    assert.ok(prompt.includes(LOGO_STYLE_LANGUAGE[job.style].construction));
  }
});

test('existing enhancement recipes survive the guidance update and keep their full original constraints', () => {
  const original = 'Two cranes facing each other. No shield, no text.';
  const enhanced = 'Two cranes with balanced neck curves, facing each other. No shield, no text.';
  const job = request({ style: 'line', prompt: enhanced, brand: '', promptEnhancement: { version: LOGO_ENHANCER_VERSION, originalPrompt: original, enhancedPrompt: enhanced } });
  const prompt = buildLogoPrompt(job);
  assert.ok(prompt.includes(original)); assert.ok(prompt.includes(enhanced));
  assert.match(prompt, /Original subjects, poses, counts, colors, exclusions and relationships remain authoritative/);
  assert.match(prompt, /leave all letters, initials, words, numbers, captions and signatures absent/);
  const payload = buildLogoEnhancerInput({ ...job, prompt: original });
  assert.match(payload.system_prompt, /normally 15–35 words/);
  assert.match(payload.system_prompt, /Do not paste styleDirection/);
  assert.equal(payload.model, 'openai/gpt-6-luna');
  assert.equal(payload.enable_web_search, false);
});
