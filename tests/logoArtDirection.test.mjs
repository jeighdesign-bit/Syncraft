import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLogoBrief, fallbackLogoDirections, validateLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { planLogoDirections } from '../src/lib/logoArtDirectorServer.js';
import { LOGO_STYLE_PROFILES } from '../src/lib/logoStyleProfiles.mjs';
import { LOGO_STYLES, validateLogoOperation, buildLogoPrompt } from '../src/lib/logoStudio.mjs';
import { STREETWEAR_STYLE } from '../src/lib/logoStyleCapabilities.mjs';
const request = { operation: 'generate', mode: 'text', style: 'wordmark', prompt: 'Cracked piggy bank and coins integrated into lettering', brand: 'TIP YOUR BARBER', tagline: 'Fresh Cuts', palette: ['#123456'] };
test('every catalog style has a profile that compiles distinct options without dropping authoritative content', () => {
  assert.deepEqual(Object.keys(LOGO_STYLE_PROFILES).sort(), LOGO_STYLES.map(style => style.id).sort());
  for (const style of Object.keys(LOGO_STYLE_PROFILES)) {
    const brief = normalizeLogoBrief({ ...request, style });
    const prompts = fallbackLogoDirections(brief, 4).map(d => compileLogoDirection(brief, d));
    assert.equal(new Set(prompts).size, 4);
    for (const prompt of prompts) { assert.ok(prompt.includes(request.prompt)); assert.ok(prompt.includes(request.brand)); assert.ok(prompt.includes(request.tagline)); assert.ok(prompt.includes('#123456')); }
  }
  for (const mode of ['image', 'sketch']) assert.throws(() => normalizeLogoBrief({ ...request, mode }));
});
test('planner validation rejects changed names, duplicates and arbitrary URLs', () => {
  const b = normalizeLogoBrief(request), d = fallbackLogoDirections(b, 2), valid = { ...b, directions: d };
  assert.equal(validateLogoDirections(valid, b, 2).length, 2);
  for (const invalid of [{ ...valid, brand: 'WRONG' }, { ...valid, directions: [d[0], d[0]] }, { ...valid, directions: [{ ...d[0], construction: 'https://bad.test' }, d[1]] }]) assert.throws(() => validateLogoDirections(invalid, b, 2));
});
test('every style keeps planning local and preserves exact controls in all four options', async () => {
  for (const style of LOGO_STYLES) {
    const input = validateLogoOperation({ ...request, requestId: crypto.randomUUID(), style: style.id });
    const planned = await planLogoDirections(input, 4, { env: { FAL_KEY: 'configured', GOOGLE_API_KEY: 'configured' }, fetchImpl: () => assert.fail('No model may rewrite the user brief') });
    assert.equal(planned.metadata.provider, 'local');
    assert.equal(planned.metadata.mode, 'style-preset');
    assert.equal(planned.metadata.usage.cost, 0);
    assert.equal(planned.brief.rawBrief, request.prompt);
    assert.equal(planned.directions[0].preserveBrief, true);
    assert.equal(new Set(planned.directions.map(d => compileLogoDirection(planned.brief, d))).size, 4);
    for (const direction of planned.directions) {
      const prompt = compileLogoDirection(planned.brief, direction);
      assert.ok(prompt.includes(request.prompt));
      assert.ok(prompt.includes('#123456'));
      assert.doesNotMatch(prompt, /Palette direction:/);
    }
  }
  for (const count of [0, 5, 1.5]) await assert.rejects(planLogoDirections(request, count), /one to four/);
});

test('Streetwear planner fallback and compiled paths retain lettering identity and selected treatments', async () => {
  const input = validateLogoOperation({ ...request, requestId: crypto.randomUUID(), style: STREETWEAR_STYLE,
    brand: 'Night Shift', prompt: '', designSettings: { streetwearLetters: 'script', streetwearDepth: 'flat', streetwearOutline: 'single', streetwearLayout: 'stacked', outlineColor: '#12ABCD' } });
  const plan = await planLogoDirections(input, 4, { env: {}, fetchImpl: () => assert.fail('Fallback must not use the network') });
  assert.equal(plan.metadata.mode, 'style-preset');
  assert.equal(new Set(plan.directions.map(direction => direction.construction)).size, 4);
  for (const prompt of [buildLogoPrompt(input), ...plan.directions.map(direction => compileLogoDirection(plan.brief, direction))]) {
    assert.match(prompt, /"Night Shift"/);
    assert.match(prompt, /#12ABCD/);
    assert.match(prompt, /script/i);
    assert.match(prompt, /flat/i);
    assert.match(prompt, /stack/i);
    assert.doesNotMatch(prompt, /thin logo outline|Flat artwork/);
  }
});

test('Streetwear needs only name and controls and keeps explicit flat/color choices authoritative', async () => {
  const input = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text',
    style: STREETWEAR_STYLE, brand: 'FORMA', prompt: '', palette: [], designSettings: {
      streetwearLetters: 'script', streetwearLayout: 'straight', streetwearOutline: 'single', streetwearDepth: 'flat',
      primaryColor: '#BF3B30', outlineColor: '#D0A150', backgroundColor: '#FAF5E8',
    } });
  const planned = await planLogoDirections(input, 1, { env: { FAL_KEY: 'configured' }, fetchImpl: () => assert.fail('No planner image or text call needed for controls-only Streetwear') });
  assert.equal(planned.metadata.provider, 'local');
  assert.equal(planned.metadata.mode, 'style-preset');
  assert.equal(planned.brief.rawBrief, '');
  for (const prompt of [buildLogoPrompt(input), compileLogoDirection(planned.brief, planned.directions[0])]) {
    assert.match(prompt, /sharp chisel-cut joins/);
    assert.match(prompt, /#FAF5E8/);
    assert.match(prompt, /primary color: #BF3B30/);
    assert.match(prompt, /outline color: #D0A150/);
    assert.match(prompt, /one straight horizontal baseline/);
    assert.match(prompt, /no extrusion, bevel, highlights or shadow shading/);
    assert.doesNotMatch(prompt, /Auto depth:|Auto lettering:|Automatic ink palette:|#191919|#F2B632/);
    assert.doesNotMatch(prompt, /wildstyle graffiti|athletic block|tribal metal/);
  }
});


test('mascot generation preserves a complete user brief without a remote anatomy or palette rewrite', async () => {
  const input = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text', style: 'mascot',
    prompt: 'Menacing snake head, evil eyes, sharp teeth, open mouth, tongue out, thick gray outline, portrait, side profile, teal and black, white background.',
    designSettings: { detail: 'minimal', characterComposition: 'portrait', mood: 'clean' } });
  const plan = await planLogoDirections(input, 4, { env: { FAL_KEY: 'configured' }, fetchImpl: () => assert.fail('Mascot anatomy must not be rewritten by the remote planner') });
  assert.equal(plan.metadata.mode, 'style-preset');
  assert.equal(plan.metadata.provider, 'local');
  assert.equal(plan.metadata.reason, 'user-led-mascot');
  const prompts = plan.directions.map(d => compileLogoDirection(plan.brief, d));
  assert.equal(new Set(prompts).size, 4);
  assert.ok(prompts[0].includes(input.prompt));
  for (const prompt of [...prompts, buildLogoPrompt(input)]) {
    assert.ok(prompt.includes(input.prompt));
    assert.match(prompt, /Minimalist/);
    assert.match(prompt, /Portrait/);
    assert.match(prompt, /inside the square artboard/);
    assert.doesNotMatch(prompt.replace(input.prompt, ''), /hollow eyes|hollow.*black|teeth.*black|tongue.*beyond the frame|Teal fills the tongue/);
  }
});

test('mascot controls keep exact brand text and assigned colors while preserving a non-snake subject', async () => {
  const input = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text', style: 'mascot',
    prompt: 'A friendly full-body astronaut bear waving.', brand: 'MOON CREW', tagline: 'Explore together',
    designSettings: { characterComposition: 'full-body', primaryColor: '#39fe98', secondaryColor: '#171717', backgroundColor: '#ffffff' } });
  const plan = await planLogoDirections(input, 1, { env: {} });
  for (const prompt of [compileLogoDirection(plan.brief, plan.directions[0]), buildLogoPrompt(input)]) {
    assert.ok(prompt.includes(input.prompt));
    assert.match(prompt, /MOON CREW/); assert.match(prompt, /Explore together/);
    assert.match(prompt, /Full body/);
    assert.match(prompt, /primary color: #39FE98/); assert.match(prompt, /secondary color: #171717/);
    assert.match(prompt, /background color: #FFFFFF/);
    assert.doesNotMatch(prompt, /snake|fang|viper|portrait/i);
  }
});


test('every selected field option survives both direct and compiled text generation identically', async () => {
  const { logoDesignFields, logoDesignInstructions } = await import('../src/lib/logoDesignSettings.mjs');
  for (const style of LOGO_STYLES) {
    for (const [key, field] of logoDesignFields(style.id, { mode: 'text' })) {
      const values = field.type === 'initials' ? ['AV'] : field.options.map(option => option.id);
      for (const value of values) {
        const input = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text', style: style.id,
          prompt: 'A recognizable owl logo with the exact requested treatment.', brand: 'FORMA', designSettings: { [key]: value } });
        const brief = normalizeLogoBrief(input);
        const prompt = compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]);
        assert.equal(prompt, buildLogoPrompt(input), style.id + ' ' + key + ' has divergent prompt paths');
        if (['mood', 'personality', 'industry'].includes(key)) assert.ok(prompt.includes(field.options.find(option => option.id === value).label), style.id + ' lost ' + key);
        else for (const instruction of logoDesignInstructions(input.designSettings, style.id, { mode: 'text' })) assert.ok(prompt.includes(instruction), style.id + ' lost ' + key);
        assert.equal(brief.rawBrief, input.prompt);
      }
    }
  }
});

test('engraving, monogram, retro colors and outline thickness do not inherit conflicting defaults', () => {
  for (const [style, designSettings, forbidden] of [
    ['engraved', { engravingTechnique: 'stipple' }, /Build directional hatching/],
    ['monogram', { monogramLetters: 'AV', monogramFont: 'sans' }, /Fuse the specified initials/],
    ['retro', { primaryColor: '#123ABC' }, /Use warm spot inks/],
    ['line', { lineThickness: 'thick', outlineColor: '#123ABC' }, /thin logo outline/],
  ]) {
    const input = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text', style, prompt: 'Follow the selected settings exactly.', brand: 'FORMA', designSettings });
    assert.doesNotMatch(buildLogoPrompt(input), forbidden);
  }
  const subject = validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text', style: 'pictorial', prompt: 'One sailboat, no face.', designSettings: { characterComposition: 'full-body' } });
  assert.match(buildLogoPrompt(subject), /Show the complete requested subject/);
  assert.doesNotMatch(buildLogoPrompt(subject), /Show the complete character from head to feet/);
});
