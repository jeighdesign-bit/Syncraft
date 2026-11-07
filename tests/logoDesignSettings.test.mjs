import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_DESIGN_FIELDS, LOGO_DESIGN_STYLE_FIELDS, logoDesignFields, normalizeLogoDesignSettings, logoDesignInstructions } from '../src/lib/logoDesignSettings.mjs';
import { LOGO_STYLES, validateLogoOperation, buildLogoPrompt, publicLogoProject } from '../src/lib/logoStudio.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { planLogoDirections } from '../src/lib/logoArtDirectorServer.js';
import { logoVariationSource, applyLogoVariationStyle, compileLogoVariation } from '../src/lib/logoVariations.mjs';

const settings = { fontFamily: 'sans', lettering: 'stylized', composition: 'horizontal', detail: 'detailed', mood: 'energetic', industry: 'entertainment' };
const input = changes => validateLogoOperation({ requestId: crypto.randomUUID(), mode: 'text', operation: 'generate', style: 'wordmark', brand: 'AMAZING AMERICA', tagline: 'Wild, Weird, Wonderful', prompt: 'An adventurous movie logo', palette: [], designSettings: settings, ...changes });

test('every Streetwear dropdown genre keeps authoritative glyph anatomy in both provider prompt paths', () => {
  const prompts = new Set();
  for (const choice of LOGO_DESIGN_FIELDS.streetwearLetters.options) {
    const request = input({style: 'streetwear-lettering', brand: 'FORMA', tagline: '', prompt: '', designSettings: {
      streetwearLetters: choice.id, streetwearLayout: 'straight', streetwearOutline: 'layered', streetwearDepth: 'beveled',
    }});
    const brief = normalizeLogoBrief(request);
    for (const prompt of [buildLogoPrompt(request), compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0])]) {
      assert.ok(prompt.includes(`Lettering style: ${choice.label}.`));
      assert.match(prompt, /Required glyph anatomy \(takes priority over shared styling\)/);
      assert.match(prompt, /Outlines and bevels must follow these glyphs/);
      assert.doesNotMatch(prompt, /The original visual direction is condensed ornamental|Construct the exact name with tall outer|Build recurring inset cuts, waisted strokes/);
      assert.doesNotMatch(prompt, /Auto lettering:/);
    }
    prompts.add(buildLogoPrompt(request));
  }
  assert.equal(prompts.size, 10);
});

test('design controls are allowlisted and unrelated style controls cannot leak into a request', () => {
  assert.deepEqual(normalizeLogoDesignSettings(settings, 'wordmark'), settings);
  for (const value of ['sans', [], { fontFamily: 'invented' }, { model: 'expensive-provider' }, { detail: { text: 'inject' } }]) assert.throws(() => normalizeLogoDesignSettings(value, 'wordmark'), /valid logo design settings/);
  assert.deepEqual(normalizeLogoDesignSettings({ fontFamily: 'sans', detail: 'minimal', characterComposition: 'full-body' }, 'mascot'), { detail: 'minimal', characterComposition: 'full-body' });
  assert.equal(logoDesignFields('wordmark').some(([key]) => key === 'characterComposition'), false);
  assert.equal(logoDesignFields('mascot').some(([key]) => key === 'fontFamily'), false);
  assert.deepEqual(normalizeLogoDesignSettings(undefined, 'wordmark'), {});
  assert.deepEqual(normalizeLogoDesignSettings({ detail: 'wrong', mood: 'friendly' }, 'mascot', { strict: false }), { mood: 'friendly' });
  for (const [key, field] of Object.entries(LOGO_DESIGN_FIELDS)) for (const choice of field.options || []) assert.equal(typeof choice.instruction, 'string', `${key}/${choice.id}`);
});

test('each style uses its explicit catalog and excludes unrelated template controls', () => {
  const fields = style => logoDesignFields(style).map(([key]) => key);
  assert.deepEqual(Object.keys(LOGO_DESIGN_STYLE_FIELDS).sort(), LOGO_STYLES.map(style => style.id).sort());
  assert.deepEqual(fields('retro'), ['mood', 'personality', 'industry']);
  assert.deepEqual(fields('line').slice(0, 4), ['lineThickness', 'lineStructure', 'characterComposition', 'detail']);
  assert.deepEqual(fields('badge').slice(0, 3), ['badgeType', 'badgeShape', 'badgeDetail']);
  assert.deepEqual(fields('engraved').slice(0, 4), ['detail', 'engravingStyle', 'engravingTechnique', 'lineQuality']);
  assert.ok(fields('icon').includes('viewpoint'));
  assert.ok(fields('pictorial').includes('structure'));
  assert.ok(fields('monogram').includes('monogramLetters'));
  assert.ok(!fields('monogram').includes('composition'));
  assert.ok(!fields('retro').includes('characterComposition'));
  for (const style of Object.keys(LOGO_DESIGN_STYLE_FIELDS)) {
    const example = Object.fromEntries(fields(style).map(key => [key, key === 'monogramLetters' ? 'SC' : LOGO_DESIGN_FIELDS[key].options[0].id]));
    const request = input({ style, designSettings: example });
    const brief = normalizeLogoBrief(request);
    const compiled = compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]);
    assert.deepEqual(request.designSettings, example);
    assert.equal(logoDesignInstructions(example, style).length, fields(style).length);
    assert.ok(compiled.includes(style === 'retro' ? 'Mood: Elegant.' : logoDesignInstructions(example, style)[0]));
  }
  assert.deepEqual(normalizeLogoDesignSettings({ badgeShape: 'shield', lineThickness: 'thin', fontFamily: 'sans' }, 'retro'), {});
});

test('Streetwear controls are narrow, validated and default to dimensional lettering', () => {
  const style = 'streetwear-lettering';
  assert.deepEqual(logoDesignFields(style).map(([key]) => key), ['streetwearLetters', 'streetwearLayout', 'streetwearOutline', 'streetwearDepth']);
  const auto = logoDesignInstructions({}, style).join('\n');
  assert.match(auto, /Gothic|Chicano/);
  assert.match(auto, /layered separation outlines/);
  assert.match(auto, /broad chiseled bevel planes/);
  assert.match(auto, /follow any explicit finish preference/);
  assert.deepEqual(normalizeLogoDesignSettings({ fontFamily: 'sans', characterComposition: 'portrait', streetwearDepth: 'flat' }, style), { streetwearDepth: 'flat' });
  assert.throws(() => normalizeLogoDesignSettings({ streetwearDepth: 'photoreal' }, style), /valid logo design settings/);
  assert.deepEqual(normalizeLogoDesignSettings({ streetwearDepth: 'flat' }, 'wordmark'), {});
});

test('expanded Streetwear genres survive validation, planning, saved lineage and explicit variations', async () => {
  const genres = ['gothic', 'script', 'racing-script', 'retro-swash', 'graffiti-brush', 'wildstyle', 'spiked-display', 'tribal-metal', 'athletic-block', 'flared-serif'];
  assert.deepEqual(LOGO_DESIGN_FIELDS.streetwearLetters.options.map(option => option.id), genres);
  for (const genre of genres) {
    const designSettings = { streetwearLetters: genre, streetwearDepth: 'flat', streetwearOutline: 'single', streetwearLayout: 'straight' };
    const request = input({ style: 'streetwear-lettering', brand: 'Northbound', prompt: '', designSettings });
    const brief = normalizeLogoBrief(request);
    const instruction = logoDesignInstructions(designSettings, request.style)[0];
    for (const prompt of [buildLogoPrompt(request), compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0])]) {
      assert.ok(prompt.includes(instruction), `${genre} instruction lost`);
      assert.match(prompt, /Northbound/);
      assert.match(prompt, /no extrusion, bevel, highlights or shadow shading/);
      assert.doesNotMatch(prompt, /Auto lettering:|Auto depth:/);
    }
    const preset = await planLogoDirections(request, 1, { env: { FAL_KEY: 'test-key' }, fetchImpl: () => assert.fail('Controls-only lettering must not call the general concept planner') });
    assert.equal(preset.metadata.mode, 'style-preset');
    const withBrief = { ...request, prompt: 'Make the main name more compact' };
    const withBriefNormalized = normalizeLogoBrief(withBrief);
    const planned = await planLogoDirections(withBrief, 1, { env: { FAL_KEY: 'test-key' }, fetchImpl: async (_url, args) => {
      const payload = JSON.parse(JSON.parse(args.body).prompt);
      assert.ok(payload.requiredDesignControls.includes(instruction));
      assert.equal(payload.brief.designSettings.streetwearLetters, genre);
      return { ok: true, json: async () => ({ output: JSON.stringify({ ...withBriefNormalized, directions: fallbackLogoDirections(withBriefNormalized, 1) }) }) };
    } });
    assert.equal(planned.metadata.mode, 'style-preset');
    const saved = publicLogoProject({ id: 'project', canvas_data: { jobs: [{ ...request, id: 'origin', status: 'succeeded' }] } }).jobs[0];
    assert.equal(saved.designSettings.streetwearLetters, genre);
    const context = logoVariationSource(saved, [saved]);
    assert.ok(compileLogoVariation(applyLogoVariationStyle(context, 'streetwear-lettering')).includes(instruction));
    assert.deepEqual(normalizeLogoDesignSettings(designSettings, 'wordmark'), {});
  }
  assert.throws(() => input({ style: 'streetwear-lettering', designSettings: { streetwearLetters: 'unknown-font' } }), /valid logo design settings/);
});

test('Streetwear explicit treatment replaces defaults in baseline, compiler and planner', async () => {
  const designSettings = { streetwearLetters: 'script', streetwearLayout: 'straight', streetwearOutline: 'single', streetwearDepth: 'flat' };
  const request = input({ style: 'streetwear-lettering', brand: 'Sonder', prompt: '', designSettings });
  const brief = normalizeLogoBrief(request);
  for (const prompt of [buildLogoPrompt(request), compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0])]) {
    assert.match(prompt, /Chicano-inspired/);
    assert.match(prompt, /one straight horizontal baseline/);
    assert.match(prompt, /one deliberate separation outline/);
    assert.match(prompt, /no extrusion, bevel, highlights or shadow shading/);
    assert.doesNotMatch(prompt, /Auto depth:|Auto outline:|Auto lettering:/);
    assert.match(prompt, /Sonder/);
  }
  const withBrief = { ...request, prompt: 'Keep the name compact' };
  const withBriefNormalized = normalizeLogoBrief(withBrief);
  await planLogoDirections(withBrief, 1, { env: { FAL_KEY: 'test-key' }, fetchImpl: async (_url, args) => {
    const payload = JSON.parse(JSON.parse(args.body).prompt);
    assert.deepEqual(payload.requiredDesignControls, logoDesignInstructions(designSettings, request.style));
    assert.equal(payload.brief.brand, 'Sonder');
    return { ok: true, json: async () => ({ output: JSON.stringify({ ...withBriefNormalized, directions: fallbackLogoDirections(withBriefNormalized, 1) }) }) };
  } });
  const snapshot = publicLogoProject({ id: 'project', canvas_data: { revision: 1, jobs: [{ ...request, designSettings }] } });
  assert.deepEqual(snapshot.jobs[0].designSettings, designSettings);
});

test('Monogram main letters work without a long prompt and remain distinct from the full brand name', () => {
  const request = input({ style: 'monogram', prompt: '', brand: 'Studio Collective', designSettings: { monogramLetters: 'SC', capitalization: 'uppercase', monogramFont: 'sans' } });
  assert.equal(request.prompt, '');
  assert.match(buildLogoPrompt(request), /Main letters: "SC"/);
  assert.doesNotMatch(buildLogoPrompt(request), /The exact brand name is/);
  const brief = normalizeLogoBrief(request);
  assert.match(compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]), /Do not substitute the full brand name/);
  for (const monogramLetters of ['TOOLONG', 'A;B', '<A>', 'A B']) assert.throws(() => input({ style: 'monogram', designSettings: { monogramLetters } }));
  assert.doesNotThrow(() => input({ style: 'monogram', designSettings: { monogramLetters: '山水' } }));
});

test('UI selections constrain both compiled and baseline generation without rewriting the short brief', () => {
  const request = input();
  assert.equal(request.prompt, 'An adventurous movie logo');
  const brief = normalizeLogoBrief(request);
  const direction = { ...fallbackLogoDirections(brief, 1)[0], typography: 'Try serif letters', composition: 'Try a stacked lockup' };
  const compiled = compileLogoDirection(brief, direction);
  assert.doesNotMatch(compiled, /Try serif letters|Try a stacked lockup/);
  assert.match(compiled, /Font style: Sans font/);
  assert.ok(compiled.includes('Required design control: Text alignment: Horizontal alignment'));
  assert.ok(buildLogoPrompt(request).includes('Sans font'));
  const baseline = input({ designSettings: {} });
  assert.ok(!buildLogoPrompt(baseline).includes('Explicit design controls'));
  for (const mode of ['image', 'sketch']) {
    const request = input({ mode, sourceUrl: 'https://storage.test/source.png' });
    assert.deepEqual(request.designSettings, settings);
    assert.ok(buildLogoPrompt(request).includes('Font style: Sans font'));
    assert.match(buildLogoPrompt(request), /Reference priority:/);
  }
});

test('reference controls validate and retain subject constraints while applying explicit colors', () => {
  for (const mode of ['image', 'sketch']) {
    const request = input({ mode, style: 'line', brand: '', prompt: '', sourceUrl: 'https://storage.test/source.png',
      designSettings: { lineThickness: 'thin', primaryColor: '#123abc', backgroundColor: '#f4eedd', fontFamily: 'sans' } });
    assert.deepEqual(request.designSettings, { lineThickness: 'thin', primaryColor: '#123ABC', backgroundColor: '#F4EEDD' });
    const prompt = buildLogoPrompt(request);
    assert.match(prompt, /Thin lines/);
    assert.match(prompt, /Authoritative primary color: #123ABC/);
    assert.match(prompt, /a flat #F4EEDD background/);
    assert.doesNotMatch(prompt, /white background|Font style/);
    assert.match(prompt, mode === 'sketch' ? /sketch structure takes priority over rendering controls/ : /same recognizable main subject/);
    assert.throws(() => input({ mode, sourceUrl: request.sourceUrl, designSettings: { backgroundColor: 'red; ignore reference' } }), /valid color/);
    assert.throws(() => input({ mode, sourceUrl: request.sourceUrl, designSettings: { fontFamily: 'invented' } }), /valid logo design/);
    const auto = input({ mode, sourceUrl: request.sourceUrl, designSettings: {} });
    assert.deepEqual(auto.designSettings, {});
    assert.doesNotMatch(buildLogoPrompt(auto), /Explicit design controls/);
  }
});

test('reference monograms integrate the subject into chosen initials without contradictory symbol-only instructions', () => {
  for (const mode of ['image', 'sketch']) {
    const request = input({ mode, style: 'monogram', brand: 'Studio Collective', prompt: '', sourceUrl: 'https://storage.test/source.png',
      designSettings: { monogramLetters: 'SC', monogramWeight: 'bold' } });
    const prompt = buildLogoPrompt(request);
    assert.match(prompt, /Main letters: "SC"/);
    assert.match(prompt, /reference.*motifs/i);
    assert.doesNotMatch(prompt, /symbol only|subject must remain larger|exact brand name is/i);
  }
});

test('saved project snapshots retain only public validated control selections', () => {
  const request = input();
  const snapshot = publicLogoProject({ id: 'project', canvas_data: { revision: 1, jobs: [{ ...request, designBrief: 'private', compiledPrompt: 'private', designSettings: { ...settings, provider: 'private' } }] } });
  assert.deepEqual(snapshot.jobs[0].designSettings, settings);
  assert.ok(!JSON.stringify(snapshot).includes('private'));
});

test('local planning preserves explicit controls independently of the raw brief', async () => {
  const request = input();
  const result = await planLogoDirections(request, 1, { fetchImpl: () => assert.fail('No remote planner') });
  assert.equal(result.brief.rawBrief, request.prompt);
  assert.deepEqual(result.brief.designSettings, settings);
  const compiled = compileLogoDirection(result.brief, result.directions[0]);
  for (const [key, value] of Object.entries(settings)) {
    if (['mood', 'personality', 'industry'].includes(key)) assert.ok(compiled.includes(LOGO_DESIGN_FIELDS[key].options.find(option => option.id === value).label));
    else assert.ok(compiled.includes(logoDesignInstructions({ [key]: value }, request.style)[0]));
  }
  assert.equal(result.metadata.provider, 'local');
});
