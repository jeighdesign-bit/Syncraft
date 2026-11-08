import test from 'node:test';
import assert from 'node:assert/strict';
import { BADGE_DIRECTION_VERSION, BADGE_DIRECTIONS } from '../src/lib/logoBadgeDirection.mjs';
import { logoDesignFields, normalizeLogoDesignSettings } from '../src/lib/logoDesignSettings.mjs';
import { validateLogoOperation, buildLogoPrompt, publicLogoProject } from '../src/lib/logoStudio.mjs';
import { normalizeLogoBrief, fallbackLogoDirections } from '../src/lib/logoDesignBrief.mjs';
import { compileLogoDirection, logoCompilerVersion } from '../src/lib/logoPromptCompiler.mjs';
import { logoVariationSource, applyLogoVariationStyle, compileLogoVariation } from '../src/lib/logoVariations.mjs';
import { resolveLogoTextDirection } from '../src/lib/logoTextDirection.mjs';
import { LOGO_EXAMPLES } from '../src/lib/logoExamples.mjs';

const controls = { badgeDirection: 'modern-club', badgeType: 'shield', badgeShape: 'shield', badgeSubject: 'full-body', badgeView: 'profile', badgeLayout: 'integrated', badgeDetail: 'minimal', mood: 'clean', personality: 'modern' };
const request = changes => validateLogoOperation({ requestId: crypto.randomUUID(), operation: 'generate', mode: 'text', style: 'badge', brand: 'WK', prompt: 'a badge with a minimal goat', designSettings: controls, ...changes });

test('new Badge controls are allowlisted for Text only and cannot affect other styles or modes', () => {
  assert.deepEqual(request().designSettings, controls);
  for (const key of ['badgeDirection', 'badgeSubject', 'badgeView', 'badgeLayout']) {
    assert.ok(logoDesignFields('badge', { mode: 'text' }).some(([field]) => field === key));
    assert.throws(() => request({ designSettings: { [key]: 'unsupported' } }), /valid logo design settings/);
    for (const mode of ['image', 'sketch']) assert.equal(normalizeLogoDesignSettings(controls, 'badge', { mode })[key], undefined);
    for (const style of ['mascot', 'wordmark', 'streetwear-lettering']) assert.equal(normalizeLogoDesignSettings(controls, style, { mode: 'text' })[key], undefined);
  }
});

test('each direction has a distinct construction and direct/batch prompts keep the same short user brief', () => {
  const prompts = new Set();
  for (const [id, direction] of Object.entries(BADGE_DIRECTIONS)) {
    const input = request({ designSettings: { badgeDirection: id } });
    const brief = normalizeLogoBrief(input);
    const prompt = buildLogoPrompt(input);
    assert.equal(brief.rawBrief, input.prompt);
    assert.equal(brief.version, BADGE_DIRECTION_VERSION);
    assert.equal(logoCompilerVersion('badge'), BADGE_DIRECTION_VERSION);
    assert.equal(prompt, compileLogoDirection(brief, fallbackLogoDirections(brief, 1)[0]));
    assert.ok(prompt.includes(direction.label)); assert.ok(prompt.includes(direction.instruction));
    assert.equal(prompt.split(direction.instruction).length, 2); // One authoritative direction.
    assert.match(prompt, /invent establishment years/);
    assert.match(prompt, /Spell every letter exactly/);
    assert.equal(resolveLogoTextDirection(input).automatic.find(x => x.field === 'badgeDetail').instruction, direction.detail);
    prompts.add(prompt);
  }
  assert.equal(prompts.size, 3);
});

test('explicit subject, view, enclosure, layout and detail override direction defaults without competing prompts', () => {
  const prompt = buildLogoPrompt(request({ designSettings: { ...controls, badgeSubject: 'portrait', badgeView: 'front', badgeShape: 'circle', badgeLayout: 'framed', badgeDetail: 'illustrative' } }));
  assert.match(prompt, /Head \/ focal detail/); assert.match(prompt, /Front view/);
  assert.match(prompt, /Circular outer enclosure/i); assert.match(prompt, /Framed illustration/);
  assert.match(prompt, /do not add a full body merely because a club crest is selected/i);
  assert.doesNotMatch(prompt, /Subject framing Auto:|Layout Auto:|prefer a complete readable body|Auto Badge detail:/);
  assert.match(prompt, /Badge shape defines the outer enclosure/);
  assert.match(resolveLogoTextDirection(request({ designSettings: { badgeLayout: 'framed' } })).automatic.find(x => x.field === 'badgeType').instruction, /framed badge/);
});

test('Auto honors brief preferences and never silently fills dropdown selections', () => {
  const input = request({ designSettings: { badgeDirection: 'modern-club' }, prompt: 'A front-view goat head in a circular badge, no stars.' });
  assert.deepEqual(input.designSettings, { badgeDirection: 'modern-club' });
  const prompt = buildLogoPrompt(input);
  assert.ok(prompt.includes(input.prompt));
  assert.match(prompt, /first follow any framing or pose specified in the brief/);
  assert.match(prompt, /Never replace an explicitly requested head with a full body/);
  assert.match(prompt, /Explicit subject framing, view, layout, enclosure, detail and color controls override direction defaults/);
});

test('saved Badge settings survive edit and utility lineage while Auto variations follow accepted artwork', () => {
  const root = { ...request(), id: 'root', status: 'succeeded' };
  const edit = { ...root, id: 'edit', operation: 'edit', sourceId: root.id, brand: 'ACCEPTED', designSettings: {} };
  const vector = { ...edit, id: 'vector', operation: 'vectorize', sourceId: edit.id };
  const jobs = [root, edit, vector];
  const visible = publicLogoProject({ id: 'project', canvas_data: { jobs } });
  assert.deepEqual(visible.jobs[0].designSettings, controls);
  const context = logoVariationSource(vector, jobs);
  assert.deepEqual(context.designSettings, controls);
  const variation = applyLogoVariationStyle(context, 'auto');
  assert.deepEqual(variation.designSettings, controls);
  const prompt = compileLogoVariation(variation);
  assert.match(prompt, /accepted image, including any style edits, is authoritative/);
  assert.doesNotMatch(prompt, /Badge craft:|Modern club crest|prefer a complete readable body/);
  assert.equal(applyLogoVariationStyle(context, 'wordmark').designSettings.badgeDirection, undefined);
});

test('the approved WK goat example retains its actual original controls and receives no invented settings', () => {
  const example = LOGO_EXAMPLES.find(item => item.id === 'wk-goat-shield');
  const input = request(example);
  assert.equal(input.designSettings.badgeDirection, undefined);
  assert.equal(input.designSettings.badgeSubject, undefined);
  assert.equal(input.designSettings.badgeDetail, 'illustrative');
  assert.equal(input.brand, 'WK'); assert.equal(input.prompt, 'a badge with a minimal goat');
});
