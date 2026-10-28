import test from 'node:test';
import assert from 'node:assert/strict';
import { LOGO_DESIGN_FIELDS, LOGO_DESIGN_STYLE_FIELDS, logoDesignFields, normalizeLogoDesignSettings, logoDesignInstructions } from '../src/lib/logoDesignSettings.mjs';
import { validateLogoOperation, buildLogoPrompt, publicLogoProject } from '../src/lib/logoStudio.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection } from '../src/lib/logoPromptCompiler.mjs';
import { planLogoDirections } from '../src/lib/logoArtDirectorServer.js';

const settings = { fontFamily: 'sans', lettering: 'stylized', composition: 'horizontal', detail: 'detailed', mood: 'energetic', industry: 'entertainment' };
const input = changes => validateLogoOperation({ requestId: crypto.randomUUID(), mode: 'text', operation: 'generate', style: 'wordmark', brand: 'AMAZING AMERICA', tagline: 'Wild, Weird, Wonderful', prompt: 'An adventurous movie logo', palette: [], designSettings: settings, ...changes });

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
  assert.equal(Object.keys(LOGO_DESIGN_STYLE_FIELDS).length, 12);
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
    assert.ok(compiled.includes(logoDesignInstructions(example, style)[0]));
  }
  assert.deepEqual(normalizeLogoDesignSettings({ badgeShape: 'shield', lineThickness: 'thin', fontFamily: 'sans' }, 'retro'), {});
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
  assert.ok(compiled.indexOf('Font style: Sans font') > compiled.indexOf('Try serif letters'));
  assert.ok(compiled.includes('Required design control (overrides conflicting concept suggestions): Text alignment: Horizontal alignment'));
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

test('the fal planner receives explicit control instructions independently of rawBrief', async () => {
  const request = input();
  const brief = normalizeLogoBrief(request);
  const result = await planLogoDirections(request, 1, { env: { FAL_KEY: 'test-key' }, fetchImpl: async (_url, args) => {
    const body = JSON.parse(args.body);
    const payload = JSON.parse(body.prompt);
    assert.equal(payload.brief.rawBrief, request.prompt);
    assert.deepEqual(payload.requiredDesignControls, logoDesignInstructions(settings, request.style));
    assert.deepEqual(payload.brief.designSettings, settings);
    return { ok: true, json: async () => ({ output: JSON.stringify({ ...brief, directions: fallbackLogoDirections(brief, 1) }) }) };
  } });
  assert.equal(result.metadata.mode, 'ai');
});
