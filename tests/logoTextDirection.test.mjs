import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { validateLogoOperation, buildLogoPrompt, publicLogoProject } from '../src/lib/logoStudio.mjs';
import { logoDesignFields, normalizeLogoDesignSettings, LOGO_DESIGN_FIELDS } from '../src/lib/logoDesignSettings.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { resolveLogoTextDirection, TEXT_STYLE_GRAMMAR, TEXT_INDUSTRIES, TEXT_MOODS, TEXT_PERSONALITIES, LOGO_TEXT_DIRECTION_VERSION } from '../src/lib/logoTextDirection.mjs';
import { nanoLogoPlan } from '../src/lib/logoFal.mjs';
import { recraftLogoPlan } from '../src/lib/logoRecraft.mjs';

const input = overrides => validateLogoOperation({ requestId: 'bd3b315c-0247-4ddc-9113-3c8b5e1288ce', operation: 'generate', mode: 'text', style: 'minimalist', prompt: 'An owl with one raised wing.', brand: 'FORMA', tagline: '', palette: [], designSettings: {}, ...overrides });

test('all twelve short-brief Auto styles have distinct construction, safe defaults and identical direct/batch contracts', () => {
  const prompts = new Set();
  for (const style of Object.keys(TEXT_STYLE_GRAMMAR)) {
    const request = input({ style });
    const brief = normalizeLogoBrief(request);
    const prompt = buildLogoPrompt(request);
    assert.equal(brief.rawBrief, request.prompt);
    assert.deepEqual(request.designSettings, {}); // Auto does not rewrite the UI selections.
    assert.equal(prompt, compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]));
    assert.ok(prompt.includes(request.prompt));
    assert.ok(prompt.includes(TEXT_STYLE_GRAMMAR[style]));
    assert.equal(brief.textDirection.industry.source, 'neutral');
    assert.match(prompt, /first honor any explicit preference/);
    assert.match(prompt, /Do not mirror/);
    assert.match(prompt, /Spell every letter exactly|monogram letters/);
    const plan = recraftLogoPlan(request);
    assert.equal(plan.model, 'recraftv4_1');
    assert.equal(plan.body.n, 1);
    assert.equal(plan.body.prompt, prompt);
    assert.equal(plan.body.style, undefined); // V3 presets are not V4.1 controls.
    assert.equal(plan.body.negative_prompt, undefined);
    prompts.add(prompt);
  }
  assert.equal(prompts.size, 12);
});

test('explicit controls remove the corresponding Auto fallback and survive validation and saved projects', () => {
  for (const style of Object.keys(TEXT_STYLE_GRAMMAR)) for (const [key, field] of logoDesignFields(style, { mode: 'text' })) {
    for (const id of field.type === 'initials' ? ['AV'] : field.options.map(option => option.id)) {
      const request = input({ style, designSettings: { [key]: id } });
      const prompt = buildLogoPrompt(request);
      assert.equal(request.designSettings[key], id, `${style}/${key}/${id}`);
      assert.equal(publicLogoProject({ id: 'test', canvas_data: { jobs: [{ ...request, id: 'job' }] } }).jobs[0].designSettings[key], id);
      assert.ok(!resolveLogoTextDirection(request).automatic.some(choice => choice.field === key));
      assert.ok(!prompt.includes(`Auto ${field.label}:`));
      assert.ok(prompt.includes(key === 'monogramLetters' ? JSON.stringify(id) : field.options.find(option => option.id === id).label));
    }
  }
});

test('all industry, mood and personality options have concrete rendering guidance, not just labels', () => {
  for (const [field, map] of [['industry', TEXT_INDUSTRIES], ['mood', TEXT_MOODS], ['personality', TEXT_PERSONALITIES]]) {
    assert.deepEqual(Object.keys(map).sort(), LOGO_DESIGN_FIELDS[field].options.map(x => x.id).sort());
    assert.equal(new Set(Object.values(map)).size, Object.keys(map).length);
    for (const [id, instruction] of Object.entries(map)) assert.ok(buildLogoPrompt(input({ style: 'mascot', designSettings: { [field]: id } })).includes(instruction));
  }
});

test('business-context inference is conservative, explicit selection wins and quoted brand names are excluded', () => {
  for (const [prompt, expected] of [['An owl for a bakery.', 'food'], ['An otter for a software company.', 'technology'], ['A fox.', null], ['A robot holding a leaf.', null], ['A cafe and travel agency.', null], ['A logo reading "Travel Agency".', null]]) {
    assert.equal(resolveLogoTextDirection(input({ prompt })).industry.id, expected);
  }
  assert.equal(resolveLogoTextDirection(input({ brand: 'Bakery', prompt: 'Bakery', designSettings: {} })).industry.id, null);
  const selected = resolveLogoTextDirection(input({ prompt: 'An owl for a bakery.', designSettings: { industry: 'technology' } }));
  assert.deepEqual(selected.industry, { id: 'technology', source: 'control' });
});

test('conflicting broad lettering hints defer to font anatomy without altering submitted settings', () => {
  const request = input({ style: 'wordmark', brand: 'Arc Vale', designSettings: { letterType: 'block', fontFamily: 'script', lettering: 'block' } });
  const prompt = buildLogoPrompt(request);
  assert.deepEqual(resolveLogoTextDirection(request).suppressedControls, ['letterType', 'lettering']);
  assert.equal(request.designSettings.letterType, 'block');
  assert.match(prompt, /Font style: Script font/);
  assert.doesNotMatch(prompt, /Build separate, clearly readable block letterforms|Use solid block lettering/);
  assert.doesNotMatch(prompt, /Auto Font style:/);
  const badge = buildLogoPrompt(input({ style: 'badge', designSettings: { badgeShape: 'circle', badgeType: 'shield' } }));
  assert.match(badge, /Badge shape defines the outer enclosure/);
  const dimensional = buildLogoPrompt(input({ style: 'monogram', designSettings: { monogramLetters: 'AV', detail: 'minimal', monogramTreatment: 'dimensional' } }));
  assert.match(dimensional, /detail budget simplifies ornament, not the requested depth/);
  const stipple = buildLogoPrompt(input({ style: 'engraved', designSettings: { detail: 'minimal', engravingTechnique: 'stipple', lineQuality: 'ultra' } }));
  assert.match(stipple, /Stippling/);
  assert.doesNotMatch(stipple, /Auto Engraving technique:/);
});

test('new character controls are Text-only and outline color cannot force an outline against No outline', () => {
  for (const style of ['mascot', 'cartoon', 'retro']) {
    assert.ok(logoDesignFields(style, { mode: 'text' }).some(([key]) => key === 'outlineThickness'));
    for (const mode of ['image', 'sketch']) {
      assert.ok(!logoDesignFields(style, { mode }).some(([key]) => key === 'outlineThickness'));
      assert.deepEqual(normalizeLogoDesignSettings({ outlineThickness: 'thick' }, style, { mode }), {});
    }
  }
  assert.throws(() => input({ style: 'mascot', designSettings: { outlineThickness: 'giant' } }), /valid logo/);
  const prompt = buildLogoPrompt(input({ style: 'mascot', designSettings: { outlineThickness: 'none', outlineColor: '#FF0000' } }));
  assert.match(prompt, /No outline is selected/);
  assert.doesNotMatch(prompt, /Authoritative outline color/);
});

test('maximum-length inputs plus all style controls fit Recraft’s prompt budget', () => {
  for (const style of Object.keys(TEXT_STYLE_GRAMMAR)) {
    const settings = Object.fromEntries(logoDesignFields(style, { mode: 'text' }).map(([key, field]) => [key, field.type === 'initials' ? 'AV' : field.options[0].id]));
    const request = input({ style, prompt: 'A'.repeat(1800), brand: 'B'.repeat(100), tagline: 'T'.repeat(160), designSettings: { ...settings, primaryColor: '#FFFFFF', secondaryColor: '#ABCDEF', outlineColor: '#123456', backgroundColor: '#010203' }, palette: ['#FFFFFF', '#ABCDEF', '#123456'] });
    assert.ok(recraftLogoPlan(request).body.prompt.length <= 10000, style);
  }
});

test('symbol-only briefs do not invite invented initials, while explicit copy remains allowed', () => {
  for (const prompt of ['A heron standing on one leg.', 'A heron, no text.', 'An otter without any lettering.']) {
    const compiled = buildLogoPrompt(input({ style: 'line', brand: '', prompt }));
    assert.match(compiled, /PRIMARY VISIBLE CONTENT: the requested subject only/);
    assert.match(compiled, /leave all letters, initials, words, numbers, captions and signatures absent/);
    assert.doesNotMatch(compiled, /only render lettering explicitly requested/);
  }
  for (const prompt of ['A heron with the text "TIDE".', 'The letter H integrated with a heron.', 'A heron with the number 7.']) {
    assert.doesNotMatch(buildLogoPrompt(input({ style: 'line', brand: '', prompt })), /PRIMARY VISIBLE CONTENT: the requested subject only/);
  }
  const selected = buildLogoPrompt(input({ style: 'monogram', designSettings: { monogramLetters: 'AV', monogramFont: 'sans' } }));
  assert.match(selected.split('\n')[1], /"AV".*SANS-SERIF.*flush unadorned/);
});

test('automatic native background has foreground contrast, respects explicit brief treatment and preserves frozen older requests', () => {
  const control = request => recraftLogoPlan(request).body.controls?.background_color;
  assert.deepEqual(control(input()), { rgb: [255, 255, 255] });
  assert.deepEqual(control(input({ prompt: 'A white horse.' })), { rgb: [17, 24, 32] });
  assert.deepEqual(control(input({ designSettings: { primaryColor: '#FFFFFF' } })), { rgb: [17, 24, 32] });
  for (const prompt of ['An owl on a navy background.', 'A white owl on cream.', 'An owl on deep blue.', 'An owl on a pale pink.', 'A transparent owl symbol.']) assert.equal(control(input({ prompt })), undefined);
  assert.deepEqual(control(input({ designSettings: { backgroundColor: '#AABBCC' } })), { rgb: [170, 187, 204] });
  assert.equal(control({ ...input(), compiledPrompt: 'An old frozen prompt', compilerVersion: 'text-direction-11' }), undefined);
  assert.deepEqual(control({ ...input(), compiledPrompt: 'New frozen contract', compilerVersion: LOGO_TEXT_DIRECTION_VERSION }), { rgb: [255, 255, 255] });
});

test('protected Image/Sketch payloads and Streetwear prompts match the pre-change baseline byte for byte', () => {
  const baseline = JSON.parse(readFileSync(new URL('./fixtures/logoProtectedFlows.json', import.meta.url), 'utf8'));
  for (const saved of baseline.snapshots) {
    const request = input({ mode: saved.mode, style: saved.style, designSettings: saved.designSettings, sourceId: '58dfc8de-61b5-43ec-9923-178b96246524' });
    const plan = nanoLogoPlan(request, 'https://source.example/reference.png');
    assert.equal(createHash('sha256').update(JSON.stringify(plan)).digest('hex'), saved.hash, `${saved.mode}/${saved.style}/${JSON.stringify(saved.designSettings)}`);
  }
  for (const saved of baseline.streetwear) {
    assert.equal(buildLogoPrompt(input({ style: 'streetwear-lettering', brand: 'DARKMEN', designSettings: saved.key ? { [saved.key]: saved.value } : {} })), saved.prompt);
  }
});
