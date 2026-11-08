import { logoVisualDirection } from '../src/lib/logoVisualDirection.mjs';
import { prepareLogoVisualGuides } from '../src/lib/logoVisualGuidesServer.mjs';
import { TEXT_STYLE_GRAMMAR } from '../src/lib/logoTextDirection.mjs';
import { LOGO_STYLE_LANGUAGE } from '../src/lib/logoStyleLanguage.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { LOGO_STYLES, LOGO_COST, LOGO_ACTIVE, LOGO_BATCH_LIMIT, logoOperationCost, logoBatchCapacity, validateLogoOperation, buildLogoPrompt, logoReplacementText, publicLogoProject, logoJobTimedOut, logoStudioAssetUrls } from '../src/lib/logoStudio.mjs';
import { recraftLogoPlan } from '../src/lib/logoRecraft.mjs';
import { nanoLogoPlan, logoFalFailure } from '../src/lib/logoFal.mjs';
import { logoUsesNano } from '../src/lib/logoModelRouting.mjs';
const studioPlan = (input, image) => {
  if (logoUsesNano(input)) {
    return nanoLogoPlan(input, image);
  }
  const plan = recraftLogoPlan(input, { image });
  return { ...plan, input: plan.body };
};
import { logoVariationSource, applyLogoVariationStyle, planLogoVariation, compileLogoVariation } from '../src/lib/logoVariations.mjs';
import { compileLogoDirection, LOGO_COMPILER_VERSION, logoCompilerVersion } from '../src/lib/logoPromptCompiler.mjs';
import { planLogoDirections } from '../src/lib/logoArtDirectorServer.js';
import { signLogoState, verifyLogoState } from '../src/lib/logoStudioIntegrity.mjs';
import { LOGO_EXPORT_FORMATS, resolveLogoExportJob } from '../src/lib/logoStudioExport.mjs';
import { STREETWEAR_STYLE, isLogoStyleAvailable, normalizeLogoStyleForMode } from '../src/lib/logoStyleCapabilities.mjs';
import { LOGO_STYLE_PROFILES } from '../src/lib/logoStyleProfiles.mjs';

const id = () => crypto.randomUUID();
const input = (changes = {}) => validateLogoOperation({ requestId: id(), prompt: 'A mountain coffee logo', brand: 'Peak', editArea: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, ...changes });

test('accepted prompt enhancement reaches actual image submission and saved recipes without changing models or prices', async () => {
  const promptEnhancement = { version: 'logo-prompt-enhancer-1', originalPrompt: 'A left-facing white horse, no shield', enhancedPrompt: 'A left-facing white horse with smooth flowing contours. No shield.' };
  for (const batched of [true, false]) {
    const h = await serviceHarness();
    const request = input({ style: 'pictorial', prompt: promptEnhancement.enhancedPrompt, promptEnhancement, brand: 'RIVER', tagline: 'OUTDOOR CO.', palette: ['#224433'] });
    if (batched) await h.service.startLogoTextBatch('owner', h.snapshot(), request, 2);
    else await h.service.startLogoOperation('owner', h.snapshot(), request);
    const jobs = h.snapshot().canvas_data.jobs;
    for (const submitted of h.submissions) {
      assert.equal(submitted.request.input.model, 'recraftv4_1');
      assert.ok(submitted.request.input.prompt.includes(promptEnhancement.originalPrompt));
      assert.ok(submitted.request.input.prompt.includes(promptEnhancement.enhancedPrompt));
      assert.match(submitted.request.input.prompt, /Original subjects, poses, counts, colors, exclusions and relationships remain authoritative/);
    }
    for (const job of jobs) {
      assert.deepEqual(job.promptEnhancement, promptEnhancement); assert.equal(job.brand, 'RIVER'); assert.equal(job.tagline, 'OUTDOOR CO.');
      assert.equal(job.creditCost, 8);
    }
    assert.deepEqual(publicLogoProject(h.snapshot()).jobs[0].promptEnhancement, promptEnhancement);
    assert.equal(h.usages.filter(usage => usage.endpoint === 'openrouter/router').length, 0);
    assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), batched ? 16 : 8);
  }
});

test('Streetwear requires exact text, accepts no description, and is creation-only in text mode', () => {
  assert.equal(input({ style: STREETWEAR_STYLE, brand: '  Night Shift  ', prompt: '' }).brand, 'Night Shift');
  assert.throws(() => input({ style: STREETWEAR_STYLE, brand: '   ' }), /exact brand name/);
  for (const mode of ['image', 'sketch']) {
    assert.equal(isLogoStyleAvailable(STREETWEAR_STYLE, mode), false);
    assert.equal(normalizeLogoStyleForMode(STREETWEAR_STYLE, mode), mode === 'image' ? 'minimalist' : 'wordmark');
    assert.throws(() => input({ style: STREETWEAR_STYLE, mode, sourceUrl: 'https://storage.test/source.png' }), /Text to Logo only/);
  }
  assert.equal(normalizeLogoStyleForMode(STREETWEAR_STYLE, 'text'), STREETWEAR_STYLE);
  for (const operation of ['edit', 'removeBg', 'vectorize', 'variations']) {
    assert.doesNotThrow(() => input({ operation, style: STREETWEAR_STYLE, sourceId: id(), brand: '', prompt: 'Make the outline gold' }));
  }
});

test('Streetwear baseline keeps exact lettering and uses illustrated depth rather than generic flat artwork', () => {
  const prompt = buildLogoPrompt(input({ style: STREETWEAR_STYLE, brand: 'Night Shift', tagline: 'Made to last', prompt: '' }));
  assert.match(prompt, /exact brand name is "Night Shift"/);
  assert.match(prompt, /"Made to last"/);
  assert.match(prompt, /tall condensed ornamental Gothic-inspired letters/);
  assert.match(prompt, /broad chiseled bevel planes/);
  assert.match(prompt, /all letter terminals, swashes and depth inside/);
  assert.doesNotMatch(prompt, /Flat artwork|Symbol only/);
});

test('creation services reject unsupported Streetwear requests before reservation, charge or submission', async () => {
  const valid = input({ style: STREETWEAR_STYLE, brand: 'Night Shift', prompt: '' });
  for (const changes of [{ mode: 'image', sourceUrl: 'https://storage.test/source.png' }, { mode: 'sketch', sourceUrl: 'https://storage.test/source.png' }, { brand: '   ' }]) {
    for (const batch of [false, true]) {
      const h = await serviceHarness();
      const request = { ...valid, ...changes };
      await assert.rejects(batch
        ? h.service.startLogoTextBatch('owner', h.snapshot(), request, 1)
        : h.service.startLogoOperation('owner', h.snapshot(), request), /Text to Logo|exact brand name/);
      assert.equal(h.snapshot().canvas_data.jobs.length, 0);
      assert.equal(h.charges.size, 0);
      assert.equal(h.submissions.length, 0);
    }
  }
});

test('brand plus controls reaches the actual service-to-provider path without a descriptive prompt', async () => {
  for (const artDirection of [false, true]) {
    for (const genre of ['gothic', 'script']) {
      const h = await serviceHarness({ artDirection });
      const request = input({ style: STREETWEAR_STYLE, brand: 'FORMA', prompt: '', designSettings: {
        streetwearLetters: genre, streetwearLayout: 'arched', streetwearDepth: 'beveled', streetwearOutline: 'layered',
      } });
      await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
      assert.equal(h.submissions.length, 1);
      assert.equal(h.charges.size, 1);
      const submitted = h.submissions[0];
      assert.equal(submitted.endpoint, 'images/generations');
      assert.equal(submitted.request.input.image_url, undefined);
      assert.match(submitted.request.input.prompt, /"FORMA"/);
      assert.match(submitted.request.input.prompt, /optional brief is blank/);
      assert.match(submitted.request.input.prompt, /#191919/);
      assert.match(submitted.request.input.prompt, /broad chiseled bevel planes/);
      assert.match(submitted.request.input.prompt, /waisted vertical stems|sharp chisel-cut joins/);
      assert.doesNotMatch(submitted.request.input.prompt, /wildstyle graffiti|athletic block|tribal metal/);
      const saved = h.snapshot().canvas_data.jobs[0];
      assert.equal(saved.prompt, '');
      assert.equal(saved.designSettings.streetwearLetters, genre);
      if (artDirection) assert.equal(h.snapshot().canvas_data.batches[0].planner.mode, 'style-preset');
    }
  }
});

test('Streetwear variation eligibility uses the saved source before billing', async () => {
  for (const mode of ['image', 'sketch']) {
    const h = await serviceHarness();
    const source = { id: id(), operation: 'generate', mode, style: 'wordmark', brand: 'Night Shift', status: 'succeeded', format: 'png', url: 'https://storage.test/logo.png' };
    h.change(project => project.canvas_data.jobs.push(source));
    await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'variations', sourceId: source.id, mode: 'text', variationStyle: STREETWEAR_STYLE })), /saved Text to Logo source/);
    assert.equal(h.snapshot().canvas_data.jobs.length, 1);
    assert.equal(h.charges.size, 0);
    assert.equal(h.submissions.length, 0);
  }
});

test('reference generation accepts no brief and sends the selected style to the provider', async () => {
  for (const mode of ['image', 'sketch']) {
    for (const style of LOGO_STYLES.filter(item => isLogoStyleAvailable(item.id, mode))) {
      const request = input({ mode, style: style.id, prompt: '   ', sourceUrl: 'https://storage.test/eagle.png' });
      const h = await serviceHarness();
      await h.service.startLogoOperation('owner', h.snapshot(), request);
      const plan = studioPlan(request, request.sourceUrl);
      assert.ok(plan.input.prompt.includes(style.name));
      assert.match(plan.input.prompt, /Peak/);
      assert.doesNotMatch(plan.input.prompt, /User preferences: \s*\./);
      assert.equal(h.submissions.length, 1);
    }
    assert.throws(() => input({ mode, prompt: '' }), /source image first/);
  }
  assert.throws(() => input({ prompt: '' }), /Describe/);
  assert.throws(() => input({ operation: 'edit', prompt: '', sourceId: id() }), /Describe/);
});

test('reference controls reach Nano Banana 2.1 and persist in saved public jobs without extra charges', async () => {
  for (const mode of ['image', 'sketch']) {
    const h = await serviceHarness();
    const request = input({ mode, ...(mode === 'sketch' ? { sketchMode: 'precise' } : {}), style: 'mascot', prompt: '', sourceUrl: 'https://storage.test/source.png',
      designSettings: { detail: 'minimal', primaryColor: '#193b53', backgroundColor: '#fff4db' } });
    await h.service.startLogoOperation('owner', h.snapshot(), request);
    const submission = h.submissions[0];
    assert.equal(submission.endpoint, 'google/nano-banana-2.1/edit');
    assert.deepEqual(submission.request.input.image_urls, [request.sourceUrl]);
    assert.match(submission.request.input.prompt, /Authoritative primary color: #193B53/);
    assert.match(submission.request.input.prompt, /#FFF4DB/);
    if (mode === 'sketch') assert.match(submission.request.input.prompt, /Sketch fidelity/);
    await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
    const saved = publicLogoProject(h.snapshot()).jobs[0];
    assert.equal(saved.status, 'succeeded');
    assert.deepEqual(saved.designSettings, request.designSettings);
    if (mode === 'sketch') assert.equal(saved.sketchMode, 'precise');
    assert.equal(h.charges.size, 1);
    assert.equal([...h.charges.values()][0].amount, 8);
  }
});

test('short preferences do not need to repeat the selected mascot style', () => {
  for (const mode of ['text', 'image', 'sketch']) {
    const request = input({ mode, style: 'mascot', prompt: 'Navy and orange, fierce expression', sourceUrl: 'https://storage.test/eagle.png' });
    const plan = studioPlan(request, request.sourceUrl);
    assert.match(plan.input.prompt, /Mascot/i);
    assert.match(plan.input.prompt, /Navy and orange, fierce expression/);
    assert.match(plan.input.prompt, /Peak/);
  }
});

test('image generation reserves a centered artboard without changing sketch or text prompts', () => {
  const image = buildLogoPrompt(input({ mode: 'image', style: 'line', sourceUrl: 'https://storage.test/portrait.png' }));
  assert.match(image, /middle 76% of the square canvas/);
  assert.match(image, /Nothing may touch or be cut off by the canvas edge/);
  for (const mode of ['text', 'sketch']) {
    const prompt = buildLogoPrompt(input({ mode, sourceUrl: mode === 'sketch' ? 'https://storage.test/sketch.png' : undefined }));
    assert.doesNotMatch(prompt, /middle 76% of the square canvas/);
  }
});

test('Wordmark accepts wording from the brief or separate brand field and keeps lettering dominant', () => {
  for (const mode of ['text', 'sketch']) {
    for (const operation of ['generate', 'variations']) {
      assert.doesNotThrow(() => input({ mode, operation, style: 'wordmark', brand: '   ', sourceUrl: 'https://storage.test/reference.png' }));
      const request = input({ mode, operation, style: 'wordmark', brand: 'Barber', prompt: 'Cracked piggy bank, coins spilling, halftone print, skate brand.', sourceUrl: 'https://storage.test/reference.png' });
      const plan = studioPlan(request, request.sourceUrl);
      assert.match(plan.input.prompt, /complete brand name clearly readable/);
      assert.match(plan.input.prompt, /exact brand name is "Barber"/);
      assert.match(plan.input.prompt, /must never replace the wordmark/);
      assert.doesNotMatch(plan.input.prompt, /[Ss]ymbol only|do not add letters|subject must remain larger|MAIN SUBJECT/);
    }
  }
  assert.doesNotThrow(() => input({ style: 'wordmark', brand: 'Barber', prompt: '' }));
  assert.throws(() => input({ style: 'wordmark', brand: '', prompt: '' }), /Describe what/);
  const briefOnly = input({ style: 'wordmark', brand: '', prompt: 'The word HOUSE built from simple geometric shapes' });
  assert.equal(briefOnly.brand, '');
  assert.match(buildLogoPrompt(briefOnly), /Use the word or name supplied in the user brief/);
  assert.match(buildLogoPrompt(briefOnly), /HOUSE/);
  assert.doesNotThrow(() => input({ style: 'mascot', brand: '' }));
  const edit = input({ operation: 'edit', style: 'wordmark', brand: '', sourceId: id(), prompt: 'Make the text red' });
  assert.match(buildLogoPrompt(edit), /Requested change: "Make the text red"/);
});

test('brief-only Wordmarks reach direct and batch Recraft generation without changing brand fields, models or pricing', async () => {
  for (const batched of [false, true]) {
    const h = await serviceHarness({ visualStyles: 'wordmark' });
    const request = input({ style: 'wordmark', brand: '', prompt: 'Building a “House” from a square, triangle and circle' });
    if (batched) await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    else await h.service.startLogoOperation('owner', h.snapshot(), request);
    const payload = h.submissions[0].request.input;
    assert.equal(payload.model, 'recraftv4_1'); assert.match(payload.prompt, /Building a “House”/);
    assert.match(payload.prompt, /preserve explicitly quoted or named wording exactly/);
    assert.equal(h.snapshot().canvas_data.jobs[0].brand, '');
    assert.equal([...h.charges.values()][0].amount, 8);
  }
});

test('approved prices are charged by the server for each mode and operation', async () => {
  for (const [operation, mode, expected] of [
    ['generate', 'text', 8], ['generate', 'image', 8], ['generate', 'sketch', 8],
    ['variations', 'text', 6], ['variations', 'image', 6], ['variations', 'sketch', 6],
    ['edit', 'text', 8], ['removeBg', 'text', 2], ['vectorize', 'text', 2],
  ]) {
    const h = await serviceHarness();
    const sourceId = id();
    h.change(project => project.canvas_data.jobs.push({ id: sourceId, status: 'succeeded', format: 'png', url: 'https://storage.test/source.png' }));
    await h.service.startLogoOperation('owner', h.snapshot(), input({ operation, mode, sourceId, creditCost: 0 }));
    assert.equal([...h.charges.values()][0].amount, expected, `${operation}/${mode}`);
    assert.equal(h.snapshot().canvas_data.jobs.at(-1).creditCost, expected);
  }
});

test('four successful outputs total 32 credits in every creation mode', async () => {
  for (const [mode, expected] of [['text', 32], ['image', 32], ['sketch', 32]]) {
    const h = await serviceHarness();
    for (let index = 0; index < 4; index++) await h.service.startLogoOperation('owner', h.snapshot(), input({ mode, ...(mode !== 'text' ? { sourceUrl: 'https://storage.test/source.png' } : {}) }));
    assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), expected);
    for (const job of h.snapshot().canvas_data.jobs) await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
    assert.equal(h.snapshot().canvas_data.jobs.filter(job => job.status === 'succeeded').length, 4);
  }
});

test('failed requests refund the actual charge at the new prices', async () => {
  for (const [mode, expected] of [['text', 8], ['image', 8], ['sketch', 8]]) {
    const h = await serviceHarness({ providerFailure: true });
    await h.service.startLogoOperation('owner', h.snapshot(), input({ mode, ...(mode !== 'text' ? { sourceUrl: 'https://storage.test/source.png' } : {}) }));
    const charge = [...h.charges.values()][0];
    assert.equal(charge.amount, expected); assert.ok(h.refunded.has(charge.id));
    assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
  }
});

function seedLogos(h, count = 4) {
  h.change(project => { project.canvas_data.jobs = Array.from({ length: count }, () => ({
    id: id(), operation: 'generate', status: 'succeeded', format: 'png', url: 'https://storage.test/logo.png',
  })); });
}

test('batch capacity counts active work and ignores completed or failed history', () => {
  const jobs = [
    { operation: 'generate', status: 'succeeded' }, { operation: 'variations', status: 'queued' },
    { operation: 'generate', status: 'failed' }, { operation: 'edit', status: 'succeeded' },
    { operation: 'removeBg', status: 'succeeded' }, { operation: 'vectorize', status: 'succeeded' },
  ];
  assert.deepEqual(logoBatchCapacity(jobs), { active: 1, remaining: 3, limit: 4 });
});

test('originals and repeated variations remain available beyond four logos and 120 saved versions', async () => {
  for (const count of [4, 121]) {
    const h = await serviceHarness(); seedLogos(h, count);
    for (const operation of ['generate', 'variations', 'variations']) {
      const request = input({ operation, sourceId: operation === 'variations' ? h.snapshot().canvas_data.jobs[0].id : undefined });
      await h.service.startLogoOperation('owner', h.snapshot(), request);
      await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
    }
    assert.equal(h.charges.size, 3); assert.equal(h.submissions.length, 3);
    assert.equal(h.snapshot().canvas_data.jobs.length, count + 3);
    assert.ok(h.snapshot().canvas_data.jobs.slice(-3).every(job => job.status === 'succeeded'));
    assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), 20);
  }
});

test('concurrent requests cannot exceed four active outputs even with unlimited history', async () => {
  const h = await serviceHarness(); seedLogos(h, 3);
  h.change(project => project.canvas_data.jobs.forEach(job => { job.status = 'queued'; }));
  const snapshot = h.snapshot();
  const requests = Array.from({ length: 2 }, () => input({ mode: 'image', sourceUrl: 'https://storage.test/source.png' }));
  const results = await Promise.allSettled(requests.map(request => h.service.startLogoOperation('owner', snapshot, request)));
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(h.charges.size, 1); assert.equal(h.submissions.length, 1);
  assert.equal(logoBatchCapacity(h.snapshot().canvas_data.jobs).active, 4);
});

test('four-output Text batches can repeat beyond a long history while five-output batches are rejected', async () => {
  const h = await serviceHarness(); seedLogos(h, 121);
  for (let batch = 0; batch < 2; batch++) {
    const request = input();
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
  }
  assert.equal(h.snapshot().canvas_data.jobs.length, 129);
  assert.equal(h.charges.size, 8); assert.equal(h.submissions.length, 8);
  assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), 64);
  await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), input(), 5), /one to four/);
  assert.equal(h.charges.size, 8); assert.equal(h.snapshot().canvas_data.jobs.length, 129);
});

test('four variations can repeat in the same project without duplicate charges on replay', async () => {
  const h = await serviceHarness(); seedLogos(h);
  const sourceId = h.snapshot().canvas_data.jobs[0].id;
  for (let batch = 0; batch < 2; batch++) {
    const requests = Array.from({ length: 4 }, () => input({ operation: 'variations', sourceId }));
    await Promise.all(requests.map(request => h.service.startLogoOperation('owner', h.snapshot(), request)));
    assert.equal(logoBatchCapacity(h.snapshot().canvas_data.jobs).active, 4);
    for (const request of requests) {
      await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
      await h.service.startLogoOperation('owner', h.snapshot(), request);
    }
    assert.equal(logoBatchCapacity(h.snapshot().canvas_data.jobs).remaining, 4);
  }
  assert.equal(h.charges.size, 8); assert.equal(h.submissions.length, 8);
  assert.equal(h.snapshot().canvas_data.jobs.filter(job => job.operation === 'variations' && job.status === 'succeeded').length, 8);
  assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), 48);
});

test('edits, background removal and vectorization remain available with a long saved history', async () => {
  for (const operation of ['edit', 'removeBg', 'vectorize']) {
    const h = await serviceHarness({ vector: operation === 'vectorize' }); seedLogos(h);
    await h.service.startLogoOperation('owner', h.snapshot(), input({ operation, sourceId: h.snapshot().canvas_data.jobs[0].id }));
    assert.equal(h.charges.size, 1); assert.equal(h.snapshot().canvas_data.jobs.length, 5);
    assert.ok(logoBatchCapacity(h.snapshot().canvas_data.jobs).remaining > 0);
  }
});

test('failed generations free their slot for retry', async () => {
  const h = await serviceHarness(); seedLogos(h);
  h.change(project => { project.canvas_data.jobs[3].status = 'failed'; });
  await h.service.startLogoOperation('owner', h.snapshot(), input());
  assert.equal(h.charges.size, 1); assert.equal(h.snapshot().canvas_data.jobs.length, 5);
  assert.equal(logoBatchCapacity(h.snapshot().canvas_data.jobs).remaining, 4);
});

test('rejects unsupported operations, palettes, missing sources, and oversized text before billing', () => {
  for (const changes of [{ operation: 'free-vectorize' }, { mode: 'video' }, { style: 'unknown' }, { palette: ['red'] }, { prompt: 'a'.repeat(1801) }, { operation: 'edit' }, { mode: 'sketch' }]) {
    assert.throws(() => input(changes));
  }
  assert.equal(input({ mode: 'image', sourceUrl: 'https://storage.test/source.png' }).mode, 'image');
  assert.equal(input({ operation: 'variations', sourceId: id(), prompt: '' }).operation, 'variations');
  assert.throws(() => input({ mode: 'sketch', sourceUrl: 'https://storage.test/sketch.png', sketchMode: 'trace' }), /Smart or Precise/);
});

test('Smart and Precise sketch prompts preserve the idea at different fidelity levels', () => {
  const brief = buildLogoPrompt(input({ mode: 'sketch', sourceUrl: 'https://storage.test/sketch.png', tagline: 'Stay curious', palette: ['#123abc'] }));
  assert.match(brief, /rough sketch/); assert.match(brief, /"Peak"/); assert.match(brief, /Stay curious/); assert.match(brief, /#123abc/);
  assert.match(brief, /Sketch interpretation/); assert.match(brief, /concept guide/);
  assert.doesNotMatch(brief, /layout blueprint/);
  const precise = buildLogoPrompt(input({ mode: 'sketch', sketchMode: 'precise', sourceUrl: 'https://storage.test/sketch.png' }));
  assert.match(precise, /Sketch fidelity/); assert.match(precise, /original positions/);
  assert.doesNotMatch(precise, /Sketch interpretation/);
  const edit = buildLogoPrompt(input({ operation: 'edit', sourceId: id(), prompt: 'Remove the star' }));
  assert.match(edit, /Requested change: "Remove the star"/);
  assert.doesNotMatch(edit, /Design one original/);
  assert.deepEqual(LOGO_STYLES.map(style => style.id).sort(), Object.keys(LOGO_STYLE_PROFILES).sort());
});

test('a short visual edit keeps saved logo wording and does not print the instruction', () => {
  const edit = buildLogoPrompt(input({ operation: 'edit', sourceId: id(), prompt: 'bear sad', brand: 'Wildbrew', tagline: 'COASTAL COFFEE' }));
  assert.match(edit, /not as a new logo brief or a caption to print/);
  assert.match(edit, /exact main brand text "Wildbrew"/);
  assert.match(edit, /exact supporting text "COASTAL COFFEE"/);
  assert.match(edit, /Do not add any new words/);
});

test('prompt-free image creation gives each visual style its own subject-first logo direction', () => {
  const sourceUrl = 'https://storage.test/portrait.png';
  const mascot = buildLogoPrompt(input({ mode: 'image', style: 'mascot', prompt: '', sourceUrl }));
  const pictorial = buildLogoPrompt(input({ mode: 'image', style: 'pictorial', prompt: '', sourceUrl }));
  for (const brief of [mascot, pictorial]) {
    assert.match(brief, /MAIN SUBJECT/);
    assert.match(brief, /strong silhouette/);
    assert.match(brief, /flat, clearly separated color shapes/);
    assert.match(brief, /No extra user prompt/);
  }
  assert.match(mascot, /head-and-shoulders or compact character pose/);
  assert.match(pictorial, /large negative-space cutouts/);
  assert.match(pictorial, /one flat ink color plus the background/);
  assert.match(pictorial, /Keep the arrangement of visible paired features/);
  assert.doesNotMatch(mascot, /large negative-space cutouts/);
});

test('photo-first visual styles keep distinct construction rules', () => {
  const expected = {
    pictorial: /one dominant solid silhouette/,
    mascot: /heavy, clean outer contour/,
    retro: /mid-century character mark/,
    cartoon: /controlled rounded exaggeration/,
    line: /separate but coordinated contour strokes/,
    icon: /few rounded solid shapes/,
    engraved: /selective parallel hatching/,
  };
  for (const [style, visualRule] of Object.entries(expected)) {
    const brief = buildLogoPrompt(input({ mode: 'image', style, prompt: '', sourceUrl: 'https://storage.test/reference.png' }));
    assert.match(brief, visualRule, style);
    assert.match(brief, /Reference priority:/, style);
    assert.doesNotMatch(brief, /wordmark construction|monogram construction/i, style);
  }
});

test('image-based Badge keeps optional brand text inside its enclosure', () => {
  const brief = buildLogoPrompt(input({ mode: 'image', style: 'badge', brand: 'Wildbrew', tagline: 'Mountain coffee', prompt: '', sourceUrl: 'https://storage.test/reference.png' }));
  assert.match(brief, /outer rim or banner/);
  assert.match(brief, /exact brand name "Wildbrew" legibly within the badge/);
  assert.match(brief, /exact tagline "Mountain coffee".*inside the badge/);
  assert.doesNotMatch(brief, /lettering BELOW the illustration/);
});

test('legacy image lettering prompts remain readable while new Image lettering creation is rejected', () => {
  const sourceUrl = 'https://storage.test/portrait.png';
  assert.throws(() => input({ mode: 'image', style: 'wordmark', brand: 'Wildbrew', prompt: '', sourceUrl }), /compatible visual style/);
  const wordmark = buildLogoPrompt({ ...input({ style: 'wordmark', brand: 'Wildbrew', prompt: '' }), mode: 'image', sourceUrl });
  assert.match(wordmark, /complete name as one cohesive, custom lettering system/);
  assert.match(wordmark, /Borrow at most one recognizable contour or negative-space motif/);
  assert.match(wordmark, /exact brand name is "Wildbrew"/);
  assert.doesNotMatch(wordmark, /subject must remain larger/);

  assert.throws(() => input({ mode: 'image', style: 'monogram', brand: '', prompt: '', sourceUrl }), /compatible visual style/);
  const monogram = buildLogoPrompt({ ...input({ style: 'monogram', brand: '', prompt: '', designSettings: { monogramLetters: 'WB' } }), mode: 'image', sourceUrl });
  assert.match(monogram, /requested 1–3 letterforms the entire primary mark/);
  assert.match(monogram, /Main letters: "WB"/);
  assert.match(monogram, /do not trace the photo/);
  assert.doesNotMatch(monogram, /subject must remain larger/);
});

test('all four new styles validate and retain their visual direction in every creation mode', async () => {
  for (const styleId of ['pictorial', 'engraved', 'icon', 'cartoon']) {
    const style = LOGO_STYLES.find(item => item.id === styleId);
    assert.ok(style);
    assert.ok((await readFile(new URL(`../public/images/logo-styles/${styleId}.webp`, import.meta.url))).length > 0);
    for (const mode of ['text', 'image', 'sketch']) {
      const request = input({ style: styleId, mode, ...(mode === 'text' ? {} : { sourceUrl: 'https://storage.test/reference.png' }) });
      const plan = studioPlan(request, request.sourceUrl);
      if (mode === 'sketch') assert.ok(plan.input.prompt.includes(`Refinement style: ${style.name}: ${style.prompt}.`));
      else if (mode === 'text') assert.ok(plan.input.prompt.includes(TEXT_STYLE_GRAMMAR[styleId]));
      else assert.ok(plan.input.prompt.includes(style.prompt));
      assert.equal(logoOperationCost('generate', mode), 8);
      assert.equal(plan.endpoint, mode === 'text' ? (['icon', 'cartoon'].includes(styleId) ? 'google/nano-banana-2.1' : 'images/generations') : 'google/nano-banana-2.1/edit');
      if (mode === 'sketch') assert.match(plan.input.prompt, /Sketch interpretation/);
      if (mode === 'image') assert.match(plan.input.prompt, /MAIN SUBJECT/);
    }
  }
});

test('public project snapshots omit billing IDs, provider inputs, and provider request IDs', () => {
  const result = publicLogoProject({ id: id(), canvas_data: { revision: 7, jobs: [{ ...input(), chargeId: 'secret', providerRequestId: 'private', sourceUrl: 'private', isOwnerTest: true }] } });
  const serialized = JSON.stringify(result);
  assert.equal(result.revision, 7);
  assert.doesNotMatch(serialized, /secret|private|isOwnerTest/);
});

test('only stale active jobs expire and every saved logo asset is included in retention', () => {
  const old = new Date(Date.now() - 16 * 60_000).toISOString();
  assert.equal(logoJobTimedOut({ status: 'queued', createdAt: old }), true);
  assert.equal(logoJobTimedOut({ status: 'succeeded', createdAt: old }), false);
  assert.equal(logoJobTimedOut({ status: 'refunding', createdAt: old }), false);
  assert.deepEqual(logoStudioAssetUrls({ tool: 'logo_studio', jobs: [{ url: 'https://s/1', sourceUrl: 'https://s/2' }, { url: 'https://s/1' }] }), ['https://s/1', 'https://s/2']);
  assert.deepEqual(logoStudioAssetUrls({ jobs: [{ url: 'https://s/1' }] }), []);
});

test('variation service freezes distinct directions against the signed source in concurrent requests', async () => {
  const h = await serviceHarness();
  const source = { id: id(), operation: 'generate', status: 'succeeded', format: 'png', url: 'https://storage.test/pug.png',
    mode: 'image', style: 'retro', prompt: 'Halloween pug aviator, pumpkin charm, ghost pin, violet goggles',
    brand: 'Night Flight', tagline: 'Fly spooky', palette: ['#ff8800'], designSettings: { primaryColor: '#ff8800', backgroundColor: '#fefefe' } };
  h.change(project => project.canvas_data.jobs.push(source));
  const requests = Array.from({ length: 3 }, () => input({ operation: 'variations', sourceId: source.id,
    mode: 'sketch', style: 'abstract', brand: 'Forged brand', prompt: 'Remove the pumpkin' }));
  const snapshot = h.snapshot();
  await Promise.all(requests.map(request => h.service.startLogoOperation('owner', snapshot, request)));
  const jobs = h.snapshot().canvas_data.jobs.slice(1);
  assert.equal(new Set(jobs.map(job => job.variationPlan.directionId)).size, 3);
  assert.equal(new Set(h.submissions.map(item => item.request.input.prompt)).size, 3);
  for (const job of jobs) {
    assert.equal(job.mode, 'image'); assert.equal(job.style, 'retro'); assert.equal(job.brand, source.brand);
    assert.equal(job.designSettings.primaryColor, '#FF8800');
    const submitted = h.submissions.find(item => item.request.input.prompt === job.compiledPrompt);
    assert.ok(submitted);
    assert.equal(submitted.endpoint, 'google/nano-banana-2.1/edit');
    assert.deepEqual(submitted.request.input.image_urls, [source.url]);
    assert.equal(submitted.request.input.seed, job.seed);
    assert.match(job.compiledPrompt, /pumpkin charm, ghost pin, violet goggles/);
    assert.match(job.compiledPrompt, /#FEFEFE/);
    assert.doesNotMatch(job.compiledPrompt, /Forged brand|Remove the pumpkin|Sketch fidelity/);
  }
  assert.equal(h.charges.size, 3); assert.equal(h.submissions.length, 3);
  assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), 18);
  assert.equal(verifyLogoState(h.snapshot().canvas_data, 'owner', snapshot.id, 'test-signing-secret'), true);
  await h.service.startLogoOperation('owner', h.snapshot(), requests[0]);
  assert.equal(h.submissions.length, 3); assert.equal(h.charges.size, 3);
  assert.doesNotMatch(JSON.stringify(publicLogoProject(h.snapshot())), /compiledPrompt|variationPlan|seed/);
});

test('explicit variation style reaches the provider and is retained as the new saved style', async () => {
  for (const mode of ['text', 'image', 'sketch']) for (const variationStyle of mode === 'image' ? ['auto', 'line', 'cartoon'] : ['auto', 'line', 'wordmark', 'monogram']) {
    const h = await serviceHarness();
    const source = { id: id(), operation: 'generate', status: 'succeeded', format: 'png', url: 'https://storage.test/pug.png',
      mode, style: 'retro', brand: 'Night Flight', prompt: 'Halloween pug, goggles, pumpkin charm', designSettings: {} };
    h.change(project => project.canvas_data.jobs.push(source));
    await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'variations', sourceId: source.id, variationStyle }));
    const job = h.snapshot().canvas_data.jobs.at(-1);
    assert.equal(job.variationStyle, variationStyle);
    assert.equal(job.sourceStyle, 'retro');
    assert.equal(job.style, variationStyle === 'auto' ? 'retro' : variationStyle);
    const submitted = h.submissions[0].request.input;
    assert.deepEqual(submitted.image_urls, [source.url]);
    assert.match(submitted.prompt, variationStyle === 'auto' ? /AUTO STYLE:/ : /CHANGE STYLE:/);
    if (variationStyle === 'line') assert.match(submitted.prompt, /consistent stroke rhythm/);
    if (variationStyle === 'monogram') assert.match(submitted.prompt, /exact main letters are "NF"/);
    await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
    assert.equal(publicLogoProject(h.snapshot()).jobs.at(-1).style, job.style);
    assert.equal(h.charges.size, 1); assert.equal(h.submissions.length, 1);
  }
});

test('Image creation and explicit variations reject incompatible styles before reservation, billing or submission', async () => {
  for (const style of ['wordmark', 'monogram', 'abstract', STREETWEAR_STYLE]) {
    const h = await serviceHarness();
    const source = { id: id(), operation: 'generate', mode: 'image', style: 'mascot', brand: 'EXISTING', status: 'succeeded', format: 'png', url: 'https://storage.test/source.png' };
    h.change(project => project.canvas_data.jobs.push(source));
    const valid = input({ mode: 'image', style: 'mascot', sourceUrl: source.url });
    await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), { ...valid, style }), /compatible visual style|Text to Logo only/);
    // Client mode/text cannot bypass the Image source's capability rules.
    const variation = input({ operation: 'variations', mode: 'text', sourceId: source.id, variationStyle: style });
    await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), variation), /image-compatible|saved Text to Logo source/);
    assert.equal(h.snapshot().canvas_data.jobs.length, 1);
    assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
  }
});

test('missing saved lettering text and forged target styles fail before reservation or charge', async () => {
  const h = await serviceHarness();
  const source = { id: id(), operation: 'generate', status: 'succeeded', format: 'png', url: 'https://storage.test/pug.png', style: 'retro' };
  h.change(project => project.canvas_data.jobs.push(source));
  for (const variationStyle of ['wordmark', 'monogram', 'unknown']) {
    await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), { ...input({ operation: 'variations', sourceId: source.id, brand: 'Forged' }), variationStyle }), /saved brand text|supported variation style/);
  }
  assert.equal(h.snapshot().canvas_data.jobs.length, 1);
  assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
});

test('variation pipeline rejects missing saved sources before billing and refunds provider failures', async () => {
  const h = await serviceHarness({ providerFailure: true });
  await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'variations', sourceUrl: 'https://storage.test/upload.png' })), /saved logo/);
  await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'variations', sourceId: id() })), /saved logo/);
  assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
  const source = { id: id(), operation: 'generate', status: 'succeeded', format: 'png', url: 'https://storage.test/pug.png', style: 'retro' };
  h.change(project => project.canvas_data.jobs.push(source));
  await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'variations', sourceId: source.id }));
  const failed = h.snapshot().canvas_data.jobs.at(-1);
  assert.equal(failed.status, 'failed'); assert.equal(h.refunded.size, 1);
  const charge = [...h.charges.values()][0];
  assert.equal(charge.amount, 6); assert.equal(failed.creditCost, 6);
  assert.ok(h.refunded.has(charge.id));
  assert.equal(logoBatchCapacity(h.snapshot().canvas_data.jobs).remaining, 4);
  await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'variations', sourceId: source.id }));
  assert.notEqual(h.snapshot().canvas_data.jobs.at(-1).variationPlan.directionId, failed.variationPlan.directionId);
  assert.equal(h.refunded.size, 2);
});

test('older eight-credit variation charges retain their full refund after the price reduction', async () => {
  const h = await serviceHarness({ resultError: new Error('Provider failed') });
  const source = { id: id(), operation: 'generate', mode: 'text', style: 'mascot', status: 'succeeded', format: 'png', url: 'https://storage.test/logo.png' };
  h.change(project => project.canvas_data.jobs.push(source));
  const request = input({ operation: 'variations', sourceId: source.id });
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  const charge = [...h.charges.values()][0];
  charge.amount = 8;
  h.change(project => { project.canvas_data.jobs.find(job => job.id === request.requestId).creditCost = 8; });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(charge.amount, 8); assert.ok(h.refunded.has(charge.id));
  assert.equal(h.refunded.size, 1);
  assert.equal(h.snapshot().canvas_data.jobs.at(-1).creditCost, 8);
  assert.equal(h.snapshot().canvas_data.jobs.at(-1).status, 'failed');
});

test('variation of an edited monogram keeps selected pixels and inherits exact initials from its ancestor', async () => {
  const h = await serviceHarness();
  const original = { id: id(), operation: 'generate', mode: 'image', style: 'monogram', status: 'succeeded',
    format: 'png', url: 'https://storage.test/initials.png', brand: 'Wild Brew', prompt: 'WB with owl motif', designSettings: { monogramLetters: 'WB' } };
  const edited = { ...original, id: id(), operation: 'edit', sourceId: original.id, url: 'https://storage.test/edited.png', prompt: 'Remove the star', designSettings: {} };
  h.change(project => project.canvas_data.jobs.push(original, edited));
  await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'variations', sourceId: edited.id }));
  const { input: submitted } = h.submissions[0].request;
  assert.deepEqual(submitted.image_urls, [edited.url]);
  assert.match(submitted.prompt, /exact main letters are "WB"/);
  assert.match(submitted.prompt, /do not replace them with the full brand name/);
  assert.doesNotMatch(submitted.prompt, /Remove the star/);
  assert.equal(h.charges.size, 1);
});

// Run the actual service with isolated I/O, not a second implementation of its rules.
async function serviceHarness(options = {}) {
  let project = { id: id(), user_id: 'owner', created_at: new Date().toISOString(), original_image_url: null, canvas_data: { tool: 'logo_studio', revision: 0, jobs: [] } };
  const sign = () => { project.canvas_data.signature = signLogoState(project.canvas_data, 'owner', project.id, 'test-signing-secret'); };
  sign();
  const charges = new Map(); const refunded = new Set(); const submissions = []; const uploads = []; const usages = []; const queueReads = [];
  let conflict = options.conflict;
  const adminSupabase = { from(table) {
    const query = { filters: [], value: null,
      select() { return this; }, eq(field, value) { this.filters.push([field, value]); return this; }, update(value) { this.value = value; return this; },
      async maybeSingle() {
        if (table === 'profiles') return { data: { credits: options.insufficient ? 0 : 1000 } };
        if (table === 'credit_logs') return { data: [...charges.values()].find(c => this.filters.some(([key, value]) => key === 'idempotency_key' && c.key === value)) || null };
        const expected = this.filters.find(([key]) => key === 'canvas_data->>revision')?.[1];
        if (expected !== String(project.canvas_data.revision)) return { data: null, error: null };
        if (conflict) { conflict = false; project.canvas_data.revision++; sign(); return { data: null, error: null }; }
        Object.assign(project, structuredClone(this.value)); return { data: structuredClone(project), error: null };
      },
    }; return query;
  } };
  const deps = {
    validateLogoOperation,
    validateLogoSvg: () => {},
    generateRecraftLogo: async (request, sourceBuffer, sourceFormat, { styleReferenceBuffer } = {}) => {
      const image = sourceBuffer ? (sourceFormat === 'svg' && request.operation !== 'removeBg' ? 'data:image/png;base64,cG5n' : request.sourceUrl) : undefined;
      const guides = styleReferenceBuffer ? { references: ['data:image/png;base64,cG5n'], metadata: { role: 'user-style-inspiration', referenceCount: 1 } } : await prepareLogoVisualGuides(request);
      const plan = recraftLogoPlan({ ...request, sourceFormat }, { image, styleReferences: guides.references });
      submissions.push({ endpoint: plan.endpoint, request: { input: plan.body }, sourceBuffer, sourceFormat });
      if (options.providerFailure) throw new Error('Provider failed');
      return { url: 'https://provider.test/result.'+plan.format, format: plan.format,
        endpoint: plan.endpoint, model: plan.model, providerRequestId: id(), cost: plan.cost,
        ...(guides.metadata ? { visualGuideResult: guides.metadata } : {}),
      };
    },
    randomUUID: id, planLogoDirections: async (...args) => { if (options.plannerFailure) throw new Error('Planner failed'); const result = await planLogoDirections(args[0], args[1], { env: {} }); if (options.plannerMetadata) result.metadata = options.plannerMetadata; return result; }, compileLogoDirection, LOGO_COMPILER_VERSION, logoCompilerVersion, logoVisualDirection,
    adminSupabase, studioPlan, nanoLogoPlan, logoFalFailure, logoUsesNano, prepareNanoLogoStyleReference: async () => 'data:image/png;base64,cG5n', logoVariationSource, applyLogoVariationStyle, planLogoVariation, compileLogoVariation, LOGO_ACTIVE, LOGO_COST, LOGO_BATCH_LIMIT, logoOperationCost, logoBatchCapacity, buildLogoPrompt, logoReplacementText, logoJobTimedOut, signLogoState, verifyLogoState,
    fitImageLogoToArtboard: async buffer => buffer,
    PROJECT_ACCESS: { OWNER: 'owner', EDIT: 'edit', VIEW: 'view' },
    getProjectAccess: async (userId, projectId, { required = 'view' } = {}) => {
      const access = userId === 'owner' ? 'owner' : options.collaborators?.[userId];
      const rank = { view: 1, edit: 2, owner: 3 };
      const allowed = projectId === project.id && rank[access] >= rank[required] && !options.expired;
      return { project: allowed ? structuredClone(project) : null, access: access || null, error: allowed ? null : 'Project access denied' };
    },
    chargeCreditsVerified: async args => {
      if (options.insufficient) { const err = new Error('INSUFFICIENT_CREDITS'); err.code = err.message; throw err; }
      const replayed = charges.has(args.idempotencyKey);
      if (!replayed) charges.set(args.idempotencyKey, { id: id(), key: args.idempotencyKey, userId: args.userId, amount: args.amount, transaction_status: 'pending' });
      return { transactionId: charges.get(args.idempotencyKey).id, isOwnerTest: false, replayed };
    },
    refundCreditVerified: async ({ chargeTransactionId }) => { if (options.refundUnavailable) throw new Error('Refund connection failed'); refunded.add(chargeTransactionId); return { refunded: true }; },
    markCreditTransaction: async ({ transactionId, status, metadata }) => { const charge = [...charges.values()].find(item => item.id === transactionId); if (charge) Object.assign(charge, { transaction_status: status, metadata }); return true; },
    recordProviderUsage: async args => usages.push(args),
    uploadToR2: async (buffer, path) => { if (options.saveFailure) throw new Error('Storage failed'); uploads.push(path); return `https://storage.test/${path}`; },
    isOwnedStorageUrl: url => url.startsWith('https://storage.test/'),
    getAllowedProviderHosts: () => ['provider.test'], getAllowedStorageHosts: () => ['storage.test'],
    DEFAULT_MAX_IMAGE_BYTES: 1000, DEFAULT_MAX_SVG_BYTES: 1000,
    fetchWithSSRFProtection: async () => { if (options.fetchFailure) throw new Error('Image unavailable'); return { response: { ok: !options.fetchNotOk }, buffer: Buffer.from(!options.raster ? '<svg><path d="M0 0h1v1z" /></svg>' : 'image') }; },
    sharp: () => ({ metadata: async () => ({ format: options.imageFormat || 'png' }), resize() { return this; }, png() { return this; }, toBuffer: async () => Buffer.from('png') }),
    fal: { queue: {
      submit: async (endpoint, request) => { submissions.push({endpoint,request}); if(options.providerFailure) throw options.providerError || new Error('Provider failed'); return { request_id:id() }; },
      status: async (endpoint, request) => { queueReads.push({ stage: 'status', endpoint, request }); if (options.statusOutage) throw new Error('Network offline'); if (options.statusError) throw options.statusError; return { status: options.status || 'COMPLETED' }; },
      result: async (endpoint, request) => { queueReads.push({ stage: 'result', endpoint, request }); if (options.resultError) throw options.resultError; return { data: { images: [{ url: 'https://provider.test/result.png' }] } }; },
    } },
  };
  const source = (await readFile(new URL('../src/lib/logoStudioServer.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const context = vm.createContext({ ...deps, structuredClone, Buffer, Blob, FormData, AbortSignal, Date, console: { error() {} }, process: { env: { LOGO_TEXT_VISUAL_STYLES: options.visualStyles || '', LOGO_ART_DIRECTION_ENABLED: options.artDirection ? 'true' : 'false', FAL_KEY: options.noFal ? undefined : 'test-only', RECRAFT_API_KEY: options.noRecraft ? undefined : 'test-only', SUPABASE_SERVICE_ROLE_KEY: 'test-signing-secret' } }, fetch: async () => ({ ok: true, json: async () => ({ image: { url: 'https://provider.test/result.svg' } }), headers: new Headers() }) });
  const service = vm.runInContext(`${source}\n({ accessibleLogoProject, ownedLogoProject, startLogoOperation, startLogoTextBatch, refreshLogoJob, mutateLogoProject })`, context);
  return { service, charges, refunded, submissions, uploads, usages, queueReads, snapshot: () => structuredClone(project), legacyPending: requestId => {
    uploads.length = 0;
    const job = project.canvas_data.jobs.find(job => job.id === requestId);
    Object.assign(job, { status: 'queued', endpoint: 'fal-ai/nano-banana-pro', providerRequestId: id(), provider: 'fal' });
    delete job.url; delete job.format; delete job.providerOutputUrl;
    const charge = [...charges.values()].find(charge => charge.id === job.chargeId);
    charge.transaction_status = 'pending'; delete charge.metadata; sign();
  }, change: fn => { fn(project); sign(); }, restore: snapshot => { project = structuredClone(snapshot); } };
}

test('fixed seed batches honor zero and wraparound, preserve faithful instructions, and retain normal charges under replay', async () => {
  for (const seed of [0, 4294967295]) {
    const h = await serviceHarness();
    const request = input({ generationOptions: { seed, conceptMode: 'faithful' } });
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
    assert.deepEqual(h.snapshot().canvas_data.jobs.map(job => job.seed), [0, 1, 2, 3].map(index => (seed + index) % 4294967296));
    assert.equal(new Set(h.submissions.map(item => item.request.input.prompt)).size, 1);
    assert.deepEqual(h.submissions.map(item => item.request.input.random_seed), [0, 1, 2, 3].map(index => (seed + index) % 4294967296));
    assert.ok(h.submissions.every(item => item.request.input.model === 'recraftv4_1'));
    assert.equal([...h.charges.values()].reduce((total, charge) => total + charge.amount, 0), 32);
  }
  const direct = await serviceHarness();
  await direct.service.startLogoOperation('owner', direct.snapshot(), input({ generationOptions: { seed: 0 } }));
  assert.equal(direct.submissions[0].request.input.random_seed, 0);
});

test('invalid or unavailable style inspiration fails before any batch reservation, planning or charge', async () => {
  for (const options of [{}, { imageFormat: 'gif' }, { fetchFailure: true }, { fetchNotOk: true }]) {
    const h = await serviceHarness(options);
    const request = input({ styleReferenceUrl: Object.keys(options).length ? 'https://storage.test/style.png' : 'https://foreign.test/style.png' });
    await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), request, 2));
    assert.equal(h.snapshot().canvas_data.jobs.length, 0); assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0); assert.equal(h.usages.length, 0);
  }
});

test('owned style inspiration reaches the native V4.1 call and survives public recipe reuse without exposing its URL', async () => {
  const h = await serviceHarness({ visualStyles: 'all' });
  const request = input({ styleReferenceUrl: 'https://storage.test/private-style.png', generationOptions: { seed: 7, styleMatch: 'precise' } });
  await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
  await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
  const body = h.submissions[0].request.input;
  assert.equal(body.style_match, 'precise'); assert.equal(body.style_reference_urls.length, 1); assert.equal(body.model, 'recraftv4_1');
  assert.equal(h.charges.size, 1); assert.equal([...h.charges.values()][0].amount, 8);
  assert.match(body.prompt, /Do not copy its subject, composition, brand name/);
  const job = h.snapshot().canvas_data.jobs[0];
  assert.equal(job.visualGuideResult.role, 'user-style-inspiration');
  assert.ok(h.usages.some(usage => usage.estimatedCostUsd === .04));
  const publicJob = publicLogoProject(h.snapshot()).jobs[0];
  assert.equal(publicJob.hasStyleReference, true); assert.equal(publicJob.effectiveSeed, 7);
  assert.doesNotMatch(JSON.stringify(publicJob), /private-style|base64/);
});

test('text batch reserves once, plans distinct directions and charges only requested outputs under replay', async () => {
  const h = await serviceHarness({ artDirection: true }); const request = input();
  await Promise.all([h.service.startLogoTextBatch('owner', h.snapshot(), request, 3), h.service.startLogoTextBatch('owner', h.snapshot(), request, 3)]);
  await h.service.startLogoTextBatch('owner', h.snapshot(), request, 3);
  assert.equal(h.charges.size, 3); assert.equal(h.submissions.length, 3);
  const state = h.snapshot().canvas_data;
  assert.equal(state.batches.length, 1); assert.equal(state.jobs.length, 3);
  assert.equal(new Set(state.jobs.map(j => j.compiledPrompt)).size, 3);
  assert.equal(h.usages.filter(u => u.endpoint === 'logo-minimalist-preset').length, 1);
  assert.equal(verifyLogoState(state, 'owner', h.snapshot().id, 'test-signing-secret'), true);
  assert.doesNotMatch(JSON.stringify(publicLogoProject(h.snapshot())), /compiledPrompt|designBrief|submissionClaimed|planner|directionId/);
});

test('text batch records reported fal planner cost once under replay and preserves unknown cost', async () => {
  for (const cost of [0.0000747, 0, null]) {
    const h = await serviceHarness({ artDirection: true, plannerMetadata: { mode: 'ai', provider: 'fal', endpoint: 'openrouter/router', model: 'qwen/qwen3-30b-a3b-instruct-2507', usage: { cost } } });
    const request = input();
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    const usage = h.usages.filter(u => u.endpoint === 'openrouter/router');
    assert.equal(usage.length, 1);
    assert.equal(usage[0].provider, 'fal');
    assert.equal(usage[0].estimatedCostUsd, cost);
    assert.equal(usage[0].metadata.imageCalls, 0);
  }
});

test('text generation freezes public design controls in the batch and enforces them with art direction on or off', async () => {
  for (const artDirection of [true, false]) {
    const h = await serviceHarness({ artDirection });
    const request = input({ style: 'wordmark', designSettings: { fontFamily: 'sans', composition: 'horizontal', detail: 'detailed' } });
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    const job = h.snapshot().canvas_data.jobs[0];
    assert.deepEqual(job.designSettings, request.designSettings);
    assert.deepEqual(publicLogoProject(h.snapshot()).jobs[0].designSettings, request.designSettings);
    assert.match(h.submissions[0].request.input.prompt, /Font style: Sans font/);
    assert.match(h.submissions[0].request.input.prompt, /do not stack or curve/);
  }
});

test('batch size, active work and authorization are validated before planning or billing', async () => {
  const h = await serviceHarness({ artDirection: true }); seedLogos(h, 3);
  h.change(project => { project.canvas_data.jobs[0].status = 'queued'; });
  await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), input(), 2), /finish/);
  await assert.rejects(h.service.startLogoTextBatch('viewer', h.snapshot(), input(), 1));
  for (const count of [0, 5, 1.5, '2']) await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), input(), count));
  assert.equal(h.charges.size, 0); assert.equal(h.usages.length, 0);
  const empty = await serviceHarness({ insufficient: true, artDirection: true });
  await assert.rejects(empty.service.startLogoTextBatch('owner', empty.snapshot(), input(), 1), /credits/);
  assert.equal(empty.snapshot().canvas_data.jobs.length, 0); assert.equal(empty.usages.length, 0);
});

test('Recraft Text batches retain server-enabled monogram guides and charge once under replay', async () => {
  const h = await serviceHarness({ artDirection: true, visualStyles: 'line,monogram' });
  const request = input({ style: 'monogram', brand: 'Arc Vale', prompt: 'An AV monogram.', designSettings: { monogramLetters: 'AV', monogramFont: 'sans' } });
  await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
  await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
  const job = h.snapshot().canvas_data.jobs[0];
  assert.equal(job.visualGuidance.style, 'monogram');
  assert.equal(job.visualGuideResult.family, 'sans');
  assert.equal(job.visualGuideResult.referenceCount, 1);
  assert.equal(job.provider, 'recraft');
  assert.equal(h.charges.size, 1); assert.equal([...h.charges.values()][0].amount, 8);
  assert.equal(h.submissions.length, 1);
  assert.equal(h.submissions[0].endpoint, 'images/generations');
  assert.equal(h.submissions[0].request.input.style_match, 'flexible');
  assert.match(h.submissions[0].request.input.style_reference_urls[0], /^data:image\/png;base64,/);
  assert.equal(h.submissions[0].request.input.image_urls, undefined);
  assert.match(h.submissions[0].request.input.prompt, /monogram letters "AV"/);
  await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
  assert.ok(h.usages.some(usage => usage.provider === 'recraft' && usage.estimatedCostUsd === .04));
  assert.doesNotMatch(JSON.stringify(publicLogoProject(h.snapshot())), /visualGuidance|visualGuideResult|base64/);
});

test('batch failure releases reservations without charging for preparation', async () => {
  const h = await serviceHarness({ artDirection: true, plannerFailure: true });
  await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), input(), 2));
  assert.equal(h.charges.size, 0); assert.equal(logoBatchCapacity(h.snapshot().canvas_data.jobs).active, 0);
});

test('rejected image submissions refund each slot; default local planning adds no paid provider calls', async () => {
  const failed = await serviceHarness({ artDirection: true, providerFailure: true });
  await failed.service.startLogoTextBatch('owner', failed.snapshot(), input(), 2);
  assert.equal(failed.refunded.size, 2); assert.equal(logoBatchCapacity(failed.snapshot().canvas_data.jobs).active, 0);
  const baseline = await serviceHarness(); const request = input();
  await baseline.service.startLogoTextBatch('owner', baseline.snapshot(), request, 1);
  assert.ok(baseline.submissions[0].request.input.prompt.endsWith(buildLogoPrompt(request)));
  await baseline.service.refreshLogoJob('owner', baseline.snapshot(), baseline.snapshot().canvas_data.jobs[0].id);
  assert.equal(baseline.usages.filter(u => u.provider !== 'recraft' && u.provider !== 'local').length, 0);
  assert.equal(baseline.usages.filter(u => u.provider === 'recraft').length, 1);
  assert.equal(baseline.usages.find(u => u.provider === 'local').estimatedCostUsd, 0);
});

test('default Text batches assign distinct constructions without an experimental flag or extra charges', async () => {
  const h = await serviceHarness({ noFal: true });
  const request = input({ style: 'badge', designSettings: { badgeDirection: 'minimal-emblem', badgeShape: 'shield' } });
  await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
  const jobs = h.snapshot().canvas_data.jobs;
  assert.equal(new Set(jobs.map(job => job.compiledPrompt)).size, 4);
  assert.ok(jobs.every(job => job.batchId === request.requestId));
  assert.ok(jobs.every(job => job.designSettings.badgeDirection === 'minimal-emblem'));
  assert.equal(h.charges.size, 4);
  assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), 32);
  assert.equal(h.submissions.length, 4);
  assert.equal(h.usages.filter(usage => usage.provider === 'local').length, 1);
});

test('a request replay submits once and charges once, including simultaneous tabs', async () => {
  const h = await serviceHarness(); const request = input(); const snapshot = h.snapshot();
  await Promise.all([h.service.startLogoOperation('owner', snapshot, request), h.service.startLogoOperation('owner', snapshot, request)]);
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  assert.equal(h.charges.size, 1); assert.equal(h.submissions.length, 1); assert.equal(h.snapshot().canvas_data.jobs.length, 1);
});

test('compare-and-swap retries preserve concurrent updates', async () => {
  const h = await serviceHarness({ conflict: true });
  await h.service.startLogoOperation('owner', h.snapshot(), input());
  assert.equal(h.submissions.length, 1); assert.ok(h.snapshot().canvas_data.revision >= 4);
});

test('a refreshed project recovers a legacy fal job and stores a permanent PNG', async () => {
  const h = await serviceHarness(); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  await Promise.all([h.service.refreshLogoJob('owner', h.snapshot(), request.requestId), h.service.refreshLogoJob('owner', h.snapshot(), request.requestId)]);
  const saved = h.snapshot().canvas_data.jobs[0];
  assert.equal(saved.status, 'succeeded'); assert.equal(saved.format, 'png');
  assert.equal(h.uploads.length, 1); assert.equal(h.refunded.size, 0);
  assert.equal(h.snapshot().original_image_url, saved.url);
});

test('failed slots refund only their own charge, preserving successful batch outputs', async () => {
  const h = await serviceHarness({ saveFailure: true }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.change(project => project.canvas_data.jobs.push({ id: id(), status: 'succeeded', url: 'https://storage.test/prior.png', format: 'png' }));
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
  assert.equal(h.snapshot().canvas_data.jobs[1].status, 'succeeded'); assert.equal(h.refunded.size, 1);
});

test('insufficient credit never submits a provider request', async () => {
  const h = await serviceHarness({ insufficient: true });
  await h.service.startLogoOperation('owner', h.snapshot(), input());
  assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0); assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
});

test('a transient status outage leaves the pending charge and job intact', async () => {
  const h = await serviceHarness({ statusOutage: true }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'queued'); assert.equal(h.refunded.size, 0);
});

test('stale jobs reconcile a charge saved before a crash, and refunds remain idempotent', async () => {
  const h = await serviceHarness({ status: 'IN_PROGRESS' }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  h.change(project => { const job = project.canvas_data.jobs[0]; delete job.chargeId; job.updatedAt = new Date(Date.now() - 16 * 60_000).toISOString(); });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.refunded.size, 1); assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
});

test('completed provider outputs remain recoverable after a long browser absence', async () => {
  const h = await serviceHarness(); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  h.change(project => { project.canvas_data.jobs[0].updatedAt = new Date(Date.now() - 60 * 60_000).toISOString(); });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded'); assert.equal(h.refunded.size, 0);
});

test('server signatures bind billing state to the owner and project and survive JSONB key ordering', () => {
  const state = { tool: 'logo_studio', jobs: [{ id: 'job', chargeId: 'charge' }], revision: 1 };
  state.signature = signLogoState(state, 'owner', 'project', 'secret');
  const reordered = { revision: 1, jobs: [{ chargeId: 'charge', id: 'job' }], tool: 'logo_studio', signature: state.signature };
  assert.equal(verifyLogoState(reordered, 'owner', 'project', 'secret'), true);
  assert.equal(verifyLogoState(reordered, 'other', 'project', 'secret'), false);
  reordered.jobs[0].chargeId = 'forged-charge';
  assert.equal(verifyLogoState(reordered, 'owner', 'project', 'secret'), false);
});

test('replaying an old signed snapshot cannot generate a second output for one charge', async () => {
  const h = await serviceHarness(); const request = input(); const initial = h.snapshot();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  const savedUrl = h.snapshot().canvas_data.jobs[0].url;
  h.restore(initial);
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  assert.equal(h.submissions.length, 1); assert.equal(h.charges.size, 1);
  assert.equal(h.snapshot().canvas_data.jobs[0].url, savedUrl);
});

test('replaying a pending snapshot cannot refund a completed charge', async () => {
  const h = await serviceHarness({ status: 'IN_PROGRESS' }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  const pending = h.snapshot();
  const charge = [...h.charges.values()][0];
  charge.transaction_status = 'succeeded'; charge.metadata = { logoOutput: { url: 'https://storage.test/completed.png', format: 'png' } };
  h.restore(pending);
  h.change(project => { project.canvas_data.jobs[0].updatedAt = new Date(Date.now() - 16 * 60_000).toISOString(); });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.refunded.size, 0); assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded');
});

test('a failed refund stays recoverable rather than falsely reporting a refund', async () => {
  const h = await serviceHarness({ providerFailure: true, refundUnavailable: true });
  await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input()), /Refund connection failed/);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'refunding'); assert.equal(h.refunded.size, 0);
});

test('shared readers verify the owner signature while sharing management stays owner-only', async () => {
  const h = await serviceHarness({ collaborators: { editor: 'edit', viewer: 'view' } });
  for (const [userId, expected] of [['owner', 'owner'], ['editor', 'edit'], ['viewer', 'view']]) {
    const authorized = await h.service.accessibleLogoProject(userId, h.snapshot().id);
    assert.equal(authorized.access, expected);
    assert.equal(verifyLogoState(authorized.project.canvas_data, 'owner', h.snapshot().id, 'test-signing-secret'), true);
  }
  for (const userId of ['editor', 'viewer', 'uninvited']) {
    await assert.rejects(h.service.ownedLogoProject(userId, h.snapshot().id), /not found/);
  }
});

test('view-only and uninvited accounts cannot mutate or charge shared logo projects', async () => {
  const h = await serviceHarness({ collaborators: { viewer: 'view' } });
  for (const userId of ['viewer', 'uninvited']) {
    await assert.rejects(h.service.startLogoOperation(userId, h.snapshot(), input()), /not found/);
    await assert.rejects(h.service.mutateLogoProject(userId, h.snapshot().id, state => state), /not found/);
  }
  assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
});

test('editor generations charge the editor and owner polling attributes provider usage to that editor', async () => {
  const h = await serviceHarness({ collaborators: { editor: 'edit' } });
  const request = input();
  await h.service.startLogoOperation('editor', h.snapshot(), request);
  assert.equal([...h.charges.values()][0].userId, 'editor');
  assert.equal([...h.charges.values()][0].amount, 8);
  assert.equal(h.snapshot().canvas_data.jobs[0].billedUserId, 'editor');
  assert.equal(verifyLogoState(h.snapshot().canvas_data, 'owner', h.snapshot().id, 'test-signing-secret'), true);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded');
  assert.equal(h.usages[0].userId, 'editor');
  assert.equal(h.charges.size, 1);
  assert.doesNotMatch(JSON.stringify(publicLogoProject(h.snapshot(), 'view')), /billedUserId|chargeId|providerRequestId/);
});

test('revoked and expired collaborators lose access before another generation can be charged', async () => {
  const collaborators = { editor: 'edit' };
  const h = await serviceHarness({ collaborators });
  const stale = h.snapshot();
  delete collaborators.editor;
  await assert.rejects(h.service.accessibleLogoProject('editor', stale.id), /not found/);
  await assert.rejects(h.service.startLogoOperation('editor', stale, input()), /not found/);
  const expired = await serviceHarness({ collaborators: { editor: 'edit', viewer: 'view' }, expired: true });
  for (const userId of ['owner', 'editor', 'viewer']) {
    await assert.rejects(expired.service.accessibleLogoProject(userId, expired.snapshot().id), /not found/);
  }
  assert.equal(h.charges.size, 0); assert.equal(expired.charges.size, 0);
});

test('owner reconciliation refunds the original editor charge when a shared output fails to save', async () => {
  const h = await serviceHarness({ collaborators: { editor: 'edit' }, saveFailure: true });
  const request = input();
  await h.service.startLogoOperation('editor', h.snapshot(), request);
  const charge = [...h.charges.values()][0];
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.equal(charge.userId, 'editor');
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
  assert.equal(h.refunded.has(charge.id), true);
  assert.equal(h.charges.size, 1);
});

test('owner and editor generations share the same four-active-output capacity', async () => {
  const h = await serviceHarness({ collaborators: { editor: 'edit' } });
  seedLogos(h, 3);
  h.change(project => project.canvas_data.jobs.forEach(job => { job.status = 'queued'; }));
  const snapshot = h.snapshot();
  const results = await Promise.allSettled(['owner', 'editor'].map(userId => h.service.startLogoOperation(userId, snapshot, input({ mode: 'image', sourceUrl: 'https://storage.test/source.png' }))));
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal(h.charges.size, 1);
  assert.equal(logoBatchCapacity(h.snapshot().canvas_data.jobs).active, 4);
});

async function logoRoutes(h, exportRoute = false) {
  const file = exportRoute ? '../src/app/api/logo-studio/export/route.js' : '../src/app/api/logo-studio/route.js';
  const source = (await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  return vm.runInNewContext(`${source}\n({ ${exportRoute ? 'POST' : 'GET, POST'} })`, {
    ...h.service, publicLogoProject, validateLogoOperation, UUID: /^[0-9a-f-]{36}$/i,
    PROJECT_ACCESS: { OWNER: 'owner', EDIT: 'edit', VIEW: 'view' },
    authenticateRequest: async request => ({ user: { id: request.headers.get('x-test-user') } }),
    enforceRateLimit: async () => ({ success: true }),
    NextResponse: { json: (body, options) => Response.json(body, options) },
    URL, Response, Buffer, crypto,
    LOGO_EXPORT_FORMATS, resolveLogoExportJob,
    createLogoExport: async () => Buffer.from('exported PNG'),
    fetchWithSSRFProtection: async () => ({ response: { ok: true }, buffer: Buffer.from('stored image') }),
    getAllowedStorageHosts: () => ['storage.test'], DEFAULT_MAX_IMAGE_BYTES: 1000, DEFAULT_MAX_SVG_BYTES: 1000,
  });
}

test('logo routes expose authorized access roles and reject view-only and uninvited writes', async () => {
  for (const [userId, access] of [['owner', 'owner'], ['editor', 'edit'], ['viewer', 'view'], ['uninvited', null]]) {
    const h = await serviceHarness({ collaborators: { editor: 'edit', viewer: 'view' } });
    const routes = await logoRoutes(h);
    const url = `https://syncraft.test/api/logo-studio?id=${h.snapshot().id}`;
    const read = await routes.GET(new Request(url, { headers: { 'x-test-user': userId } }));
    assert.equal(read.ok, !!access);
    if (access) assert.equal((await read.json()).project.access, access);
    const write = await routes.POST(new Request(url, { method: 'POST', headers: { 'x-test-user': userId }, body: JSON.stringify({ ...input(), projectId: h.snapshot().id }) }));
    const canWrite = ['owner', 'edit'].includes(access);
    assert.equal(write.ok, canWrite);
    assert.equal(h.charges.size, canWrite ? 1 : 0);
    if (canWrite) assert.equal([...h.charges.values()][0].userId, userId);
  }
});

test('saved logo downloads are available to invited viewers but denied after access is revoked', async () => {
  const collaborators = { viewer: 'view' };
  const h = await serviceHarness({ collaborators });
  const jobId = id();
  h.change(project => project.canvas_data.jobs.push({ id: jobId, status: 'succeeded', format: 'png', url: 'https://storage.test/logo.png' }));
  const routes = await logoRoutes(h, true);
  const request = () => new Request('https://syncraft.test/api/logo-studio/export', { method: 'POST', headers: { 'x-test-user': 'viewer' }, body: JSON.stringify({ projectId: h.snapshot().id, jobId, format: 'png' }) });
  const allowed = await routes.POST(request());
  assert.equal(allowed.ok, true);
  assert.equal(allowed.headers.get('Content-Type'), 'image/png');
  delete collaborators.viewer;
  assert.equal((await routes.POST(request())).ok, false);
  assert.equal(h.charges.size, 0);
});

test('another user cannot read a logo project or submit operations against it', async () => {
  const h = await serviceHarness();
  await assert.rejects(h.service.ownedLogoProject('other-user', h.snapshot().id), /not found/);
  await assert.rejects(h.service.startLogoOperation('other-user', h.snapshot(), input()), /not found/);
  assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
});

test('SVG export produces a vector derivative without changing the source PNG', async () => {
  const h = await serviceHarness({ vector: true }); const sourceId = id();
  h.change(project => project.canvas_data.jobs.push({ id: sourceId, status: 'succeeded', format: 'png', url: 'https://storage.test/source.png' }));
  await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'vectorize', sourceId }));
  assert.equal(h.snapshot().canvas_data.jobs[0].format, 'png');
  assert.equal(h.snapshot().canvas_data.jobs[1].format, 'svg'); assert.equal(h.submissions.length, 1); assert.equal(h.refunded.size, 0);
});

test('Streetwear generation keeps Recraft V4.1, saves PNG and records the correct provider cost', async () => {
  const h = await serviceHarness();
  await h.service.startLogoOperation('owner', h.snapshot(), input({ style: STREETWEAR_STYLE }));
  const pending = h.snapshot().canvas_data.jobs[0];
  assert.equal(pending.provider, 'recraft'); assert.equal(pending.endpoint, 'images/generations'); assert.equal(pending.model, 'recraftv4_1'); assert.equal(pending.status, 'succeeded');
  await h.service.refreshLogoJob('owner', h.snapshot(), pending.id);
  const project = h.snapshot(); const job = project.canvas_data.jobs[0];
  assert.equal(job.provider, 'recraft'); assert.equal(job.format, 'png'); assert.equal(job.status, 'succeeded');
  assert.equal(project.original_image_url, job.url);
  assert.equal(h.usages[0].provider, 'recraft'); assert.equal(h.usages[0].estimatedCostUsd, 0.035);
  assert.equal(h.refunded.size, 0);
});

test('saved SVG supports edit, variations and background removal; vectorize rejects before charging', async () => {
  for (const operation of ['edit', 'variations', 'removeBg', 'vectorize']) {
    const h = await serviceHarness(); const sourceId = id();
    h.change(project => project.canvas_data.jobs.push({ id: sourceId, status: 'succeeded', format: 'svg', url: 'https://storage.test/source.svg' }));
    if (operation === 'vectorize') {
      await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation, sourceId })), /already a vector/);
      assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
    } else {
      await h.service.startLogoOperation('owner', h.snapshot(), input({ operation, sourceId }));
      if (operation !== 'removeBg') {
        assert.equal(h.submissions[0].endpoint, 'google/nano-banana-2.1/edit');
        assert.match(h.submissions[0].request.input.image_urls[0], /^data:image\/png;base64,/);
        await h.service.refreshLogoJob('owner', h.snapshot(), h.snapshot().canvas_data.jobs[1].id);
      }
      assert.equal(h.snapshot().canvas_data.jobs[1].status, 'succeeded');
      assert.equal(h.snapshot().canvas_data.jobs[1].format, operation === 'removeBg' ? 'svg' : 'png');
    }
  }
});

test('a persisted Recraft output resumes saving without generating or charging again', async () => {
  const h = await serviceHarness(); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.change(project => {
    const job = project.canvas_data.jobs[0]; job.status = 'saving'; job.provider = 'recraft';
    job.providerOutputUrl = 'https://provider.test/prior.svg'; job.outputFormat = 'svg';
    job.updatedAt = new Date(Date.now() - 120_000).toISOString(); delete job.url; delete job.format;
  });
  h.uploads.length = 0;
  await Promise.all([h.service.refreshLogoJob('owner', h.snapshot(), request.requestId), h.service.refreshLogoJob('owner', h.snapshot(), request.requestId)]);
  assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded');
  assert.equal(h.submissions.length, 1); assert.equal(h.charges.size, 1); assert.equal(h.uploads.length, 1);
});

test('Recraft creation plus a single Recraft vectorization costs 10 credits and duplicate vectorization is blocked', async () => {
  const h = await serviceHarness(); const create = input();
  await h.service.startLogoOperation('owner', h.snapshot(), create);
  await h.service.refreshLogoJob('owner', h.snapshot(), create.requestId);
  await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'vectorize', sourceId: create.requestId }));
  assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), 10);
  assert.equal(h.snapshot().canvas_data.jobs[0].format, 'png');
  assert.equal(h.snapshot().canvas_data.jobs[1].format, 'svg');
  await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'vectorize', sourceId: create.requestId })), /SVG already exists/);
  assert.equal(h.charges.size, 2); assert.equal(h.submissions.length, 2);
});

test('a legacy six-credit job refunds its original transaction after the ten-credit price change', async () => {
  const h = await serviceHarness({ status: 'IN_PROGRESS' }); const request = input();
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  h.legacyPending(request.requestId);
  const charge = [...h.charges.values()][0]; charge.amount = 6;
  h.change(project => { const job = project.canvas_data.jobs[0]; job.creditCost = 6; job.updatedAt = new Date(Date.now() - 16 * 60_000).toISOString(); });
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  assert.ok(h.refunded.has(charge.id)); assert.equal(charge.amount, 6); assert.equal(h.charges.size, 1);
});

test('missing Recraft credentials fail before reservations and billing, including text batches', async () => {
 const h = await serviceHarness({ noRecraft: true }); const request = input({ style: STREETWEAR_STYLE });
 await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), request), /Recraft is not configured/);
 await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), request, 4), /Recraft is not configured/);
 assert.equal(h.charges.size,0); assert.equal(h.submissions.length,0); assert.equal(h.snapshot().canvas_data.jobs.length,0);
});

test('four synchronous Recraft results retain all outputs and charges across concurrent saves and replay', async () => {
  const h = await serviceHarness({ conflict: true, artDirection: true }); const request = input({ style: STREETWEAR_STYLE });
  const result = await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
  assert.equal(result.canvas_data.jobs.length, 4);
  assert.ok(result.canvas_data.jobs.every(j => j.status === 'succeeded' && j.provider === 'recraft' && j.model === 'recraftv4_1' && j.format === 'png'));
  assert.equal(h.charges.size, 4); assert.equal(h.submissions.length, 4); assert.equal(h.uploads.length, 4);
  assert.equal(new Set(h.submissions.map(s => s.request.input.random_seed)).size, 4);
  assert.equal(h.usages.filter(u => u.provider === 'recraft').length, 4);
  await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
  assert.equal(h.charges.size, 4); assert.equal(h.submissions.length, 4);
});

test('Image and Sketch use Nano Banana 2.1 without Recraft credentials, recover PNG and charge once', async () => {
  for (const mode of ['image', 'sketch']) {
    const h = await serviceHarness({ noRecraft: true });
    const request = input({ mode, sourceUrl: 'https://storage.test/source.png' });
    await h.service.startLogoOperation('owner', h.snapshot(), request);
    const queued = h.snapshot().canvas_data.jobs[0];
    assert.equal(queued.provider, 'fal'); assert.equal(queued.model, 'nano-banana-2.1');
    assert.equal(queued.endpoint, 'google/nano-banana-2.1/edit'); assert.equal(queued.status, 'queued');
    assert.equal(queued.estimatedCostUsd, null);
    assert.deepEqual(h.submissions[0].request.input.image_urls, [request.sourceUrl]);
    await h.service.startLogoOperation('owner', h.snapshot(), request);
    assert.equal(h.charges.size, 1); assert.equal(h.submissions.length, 1);
    await h.service.refreshLogoJob('owner', h.snapshot(), queued.id);
    assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded');
    assert.equal(h.snapshot().canvas_data.jobs[0].format, 'png');
    assert.equal(h.usages[0].provider, 'fal'); assert.equal(h.usages[0].estimatedCostUsd, null);
  }
});

test('refresh polls each saved Nano endpoint and keeps token-billed cost unknown without resubmission', async () => {
  for (const [endpoint, model, cost] of [
    ['fal-ai/nano-banana-2/edit', 'nano-banana-2', .08],
    ['google/nano-banana-2.1/edit', 'nano-banana-2.1', null],
  ]) {
    const h = await serviceHarness({ noRecraft: true });
    const request = input({ mode: 'image', sourceUrl: 'https://storage.test/source.png' });
    await h.service.startLogoOperation('owner', h.snapshot(), request);
    h.change(project => {
      const job = project.canvas_data.jobs[0];
      Object.assign(job, { endpoint, model });
      delete job.estimatedCostUsd;
    });
    const queued = h.snapshot().canvas_data.jobs[0];
    await h.service.refreshLogoJob('owner', h.snapshot(), queued.id);
    assert.deepEqual(h.queueReads.map(read => read.stage), ['status', 'result']);
    for (const read of h.queueReads) {
      assert.equal(read.endpoint, endpoint);
      assert.equal(read.request.requestId, queued.providerRequestId);
    }
    assert.equal(h.usages[0].estimatedCostUsd, cost);
    assert.equal(h.snapshot().canvas_data.jobs[0].status, 'succeeded');
    assert.equal(h.submissions.length, 1); assert.equal(h.charges.size, 1);
  }
});

test('a structured provider rejection with an empty message refunds once and never reports a storage failure', async () => {
  for (const stage of ['submit', 'status', 'result']) {
    const providerError = Object.assign(new Error(''), {
      name: 'ValidationError', status: 422,
      body: { detail: [{ type: 'content_policy_violation', msg: 'PRIVATE PROVIDER MESSAGE', input: 'PRIVATE INPUT', categories: ['model_moderated'] }] },
    });
    const h = await serviceHarness({ noRecraft: true,
      ...(stage === 'submit' ? { providerFailure: true, providerError } : { [stage + 'Error']: providerError }),
    });
    const request = input({ mode: 'image', sourceUrl: 'https://storage.test/source.png' });
    await h.service.startLogoOperation('owner', h.snapshot(), request);
    await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
    await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
    const failed = h.snapshot().canvas_data.jobs[0];
    assert.equal(failed.status, 'failed');
    assert.equal(failed.providerErrorCode, 'content_policy_violation');
    assert.equal(failed.providerStatus, 422);
    assert.equal(failed.failureStage, 'provider-' + stage);
    assert.match(failed.error, /provider declined.*content check/);
    assert.match(failed.error, /Credits refunded/);
    assert.doesNotMatch(failed.error, /could not be saved/);
    assert.doesNotMatch(JSON.stringify(failed), /PRIVATE PROVIDER MESSAGE|PRIVATE INPUT/);
    assert.equal(publicLogoProject(h.snapshot()).jobs[0].error, failed.error);
    assert.equal(h.submissions.length, 1); assert.equal(h.charges.size, 1);
    assert.equal(h.refunded.size, 1); assert.equal(h.uploads.length, 0);
  }
});

test('an actual storage failure stays distinct from a provider content rejection', async () => {
  const h = await serviceHarness({ noRecraft: true, saveFailure: true });
  const request = input({ mode: 'sketch', sourceUrl: 'https://storage.test/source.png' });
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  await h.service.refreshLogoJob('owner', h.snapshot(), request.requestId);
  const failed = h.snapshot().canvas_data.jobs[0];
  assert.equal(failed.failureStage, 'storage');
  assert.equal(failed.providerErrorCode, null);
  assert.match(failed.error, /The logo could not be saved.*Credits refunded/);
  assert.equal(h.refunded.size, 1);
});

test('provider credentials are required only for the selected creation mode before billing', async () => {
  const reference = await serviceHarness({ noFal: true });
  for (const mode of ['image', 'sketch']) {
    await assert.rejects(reference.service.startLogoOperation('owner', reference.snapshot(), input({ mode, sourceUrl:'https://storage.test/source.png' })), /not configured/);
  }
  assert.equal(reference.charges.size, 0); assert.equal(reference.snapshot().canvas_data.jobs.length, 0);
  const text = await serviceHarness({ noFal: true });
  await text.service.startLogoTextBatch('owner', text.snapshot(), input({ style: STREETWEAR_STYLE }), 1);
  assert.equal(text.snapshot().canvas_data.jobs[0].provider, 'recraft');
  assert.equal(text.snapshot().canvas_data.jobs[0].status, 'succeeded');
});


test('non-Streetwear edits and variations use Nano through utility history in every creation mode', async () => {
  for (const mode of ['text', 'image', 'sketch']) {
    for (const operation of ['edit', 'variations', 'removeBg', 'vectorize']) {
      const usesNano = ['edit', 'variations'].includes(operation);
      const h = await serviceHarness(usesNano ? { noRecraft: true } : { noFal: true });
      const root = { id: id(), operation: 'generate', mode, style: 'mascot', prompt: 'A friendly owl', status: 'succeeded', format: 'png', url: 'https://storage.test/original.png' };
      const wrongMode = mode === 'text' ? 'image' : 'text';
      const source = { ...root, id: id(), operation: 'removeBg', sourceId: root.id, mode: wrongMode, url: 'https://storage.test/transparent.png' };
      h.change(project => project.canvas_data.jobs.push(root, source));
      const request = input({ operation, mode: wrongMode, sourceId: source.id, prompt: 'Make the primary fill blue' });
      await h.service.startLogoOperation('owner', h.snapshot(), request);
      const job = h.snapshot().canvas_data.jobs.find(item => item.id === request.requestId);
      assert.equal(job.mode, mode);
      assert.equal(job.provider, usesNano ? 'fal' : 'recraft');
      assert.equal(job.model, usesNano ? 'nano-banana-2.1' : ['edit', 'variations'].includes(operation) ? 'recraftv4_1' : undefined);
      const endpoint = usesNano ? 'google/nano-banana-2.1/edit' : operation === 'removeBg' ? 'images/removeBackground' : operation === 'vectorize' ? 'images/vectorize' : 'images/imageToImage';
      assert.equal(job.endpoint, endpoint);
      if (usesNano) {
        assert.deepEqual(h.submissions[0].request.input.image_urls, [source.url]);
        assert.equal(job.status, 'queued');
        await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
      }
      assert.equal(h.snapshot().canvas_data.jobs.find(item => item.id === job.id).status, 'succeeded');
      await h.service.startLogoOperation('owner', h.snapshot(), request);
      assert.equal(h.submissions.length, 1);
      assert.equal(h.charges.size, 1);
      assert.equal([...h.charges.values()][0].amount, operation === 'variations' ? 6 : operation === 'edit' ? 8 : 2);
      assert.equal(h.usages[0].estimatedCostUsd, usesNano ? null : ['edit', 'variations'].includes(operation) ? .035 : .01);
    }
  }
});

test('Image and Sketch refinements rasterize saved SVG sources before sending them to Nano', async () => {
  for (const mode of ['image', 'sketch']) {
    for (const operation of ['edit', 'variations']) {
      const h = await serviceHarness({ noRecraft: true });
      const root = { id: id(), operation: 'generate', mode, style: 'mascot', prompt: 'A friendly owl', status: 'succeeded', format: 'png', url: 'https://storage.test/original.png' };
      const vector = { ...root, id: id(), operation: 'vectorize', sourceId: root.id, format: 'svg', url: 'https://storage.test/vector.svg' };
      h.change(project => project.canvas_data.jobs.push(root, vector));
      const request = input({ operation, sourceId: vector.id, prompt: 'Make the primary fill blue' });
      await h.service.startLogoOperation('owner', h.snapshot(), request);
      assert.equal(h.submissions[0].endpoint, 'google/nano-banana-2.1/edit');
      assert.match(h.submissions[0].request.input.image_urls[0], /^data:image\/png;base64,/);
      const job = h.snapshot().canvas_data.jobs.find(item => item.id === request.requestId);
      assert.equal(job.mode, mode);
      assert.equal(job.provider, 'fal');
    }
  }
});


test('Streetwear GRAVE to MANLY keeps Recraft despite a forged client style and freezes an isolated edit prompt', async () => {
  const h = await serviceHarness({ noFal: true, visualStyles: 'all' });
  const original = { id: id(), operation: 'generate', mode: 'text', style: 'streetwear-lettering', brand: 'GRAVE', tagline: 'FOUR MAN', prompt: '', compiledPrompt: 'CREATE AN UNRELATED CHARACTER', status: 'succeeded', format: 'png', url: 'https://storage.test/original.png', designSettings: {} };
  h.change(project => project.canvas_data.jobs.push(original));
  const request = input({ operation: 'edit', style: 'mascot', brand: 'FORGED', tagline: 'WRONG', sourceId: original.id, prompt: 'change the text, MANLY' });
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  const jobs = h.snapshot().canvas_data.jobs;
  const edited = jobs.find(j => j.id === request.requestId);
  assert.equal(edited.brand, 'MANLY');
  assert.equal(edited.tagline, 'FOUR MAN');
  assert.equal(edited.mode, 'text');
  assert.equal(edited.style, original.style);
  assert.equal(edited.provider, 'recraft');
  assert.equal(edited.model, 'recraftv4_1');
  assert.equal(edited.status, 'succeeded');
  assert.equal(jobs[0].brand, 'GRAVE');
  assert.equal(logoVariationSource(edited, jobs).brand, 'MANLY');
  assert.equal(h.submissions[0].endpoint, 'images/imageToImage');
  const payload = h.submissions[0].request.input;
  assert.equal(payload.image_url, original.url);
  assert.equal(payload.strength, .3);
  assert.equal(payload.style_reference_urls, undefined);
  assert.equal(payload.controls, undefined);
  assert.equal(edited.visualGuidance, undefined);
  assert.equal(payload.prompt, edited.compiledPrompt);
  assert.match(payload.prompt, /exactly "MANLY"/);
  assert.match(payload.prompt, /supporting text "FOUR MAN"/);
  assert.doesNotMatch(payload.prompt, /CREATE AN UNRELATED CHARACTER|Keep the exact main brand text "GRAVE"/);
  await h.service.refreshLogoJob('owner', h.snapshot(), edited.id);
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  assert.equal(h.snapshot().canvas_data.jobs.at(-1).status, 'succeeded');
  assert.equal(h.submissions.length, 1);
  assert.equal(h.charges.size, 1);
  assert.equal(h.usages[0].estimatedCostUsd, .035);
});

test('AI Edit needs fal credentials before billing and never falls back to available Recraft credentials', async () => {
  const h = await serviceHarness({ noFal: true });
  const original = { id: id(), operation: 'generate', mode: 'text', style: 'wordmark', brand: 'GRAVE', status: 'succeeded', format: 'png', url: 'https://storage.test/original.png' };
  h.change(project => project.canvas_data.jobs.push(original));
  await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'edit', sourceId: original.id, prompt: 'change the text to MANLY' })), /AI Edit is not configured/);
  assert.equal(h.charges.size, 0);
  assert.equal(h.submissions.length, 0);
  assert.equal(h.snapshot().canvas_data.jobs.length, 1);
});

test('a rejected text-source AI Edit refunds its one charge without generating a replacement concept', async () => {
  const h = await serviceHarness({ providerFailure: true });
  const original = { id: id(), operation: 'generate', mode: 'text', style: 'wordmark', brand: 'GRAVE', status: 'succeeded', format: 'png', url: 'https://storage.test/original.png' };
  h.change(project => project.canvas_data.jobs.push(original));
  const request = input({ operation: 'edit', sourceId: original.id, prompt: 'change the text to MANLY' });
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  await h.service.startLogoOperation('owner', h.snapshot(), request);
  assert.equal(h.snapshot().canvas_data.jobs.at(-1).status, 'failed');
  assert.equal(h.submissions.length, 1);
  assert.equal(h.submissions[0].endpoint, 'google/nano-banana-2.1/edit');
  assert.equal(h.charges.size, 1);
  assert.equal(h.refunded.size, 1);
});


test('mascot text batches use the literal brief on Nano without Recraft or a remote planner', async () => {
  const h = await serviceHarness({ artDirection: true, noRecraft: true });
  const request = input({ style: 'mascot', prompt: 'A teal and black snake head in side profile, white eyes, white fangs, thick gray outline and white background.', brand: '', designSettings: { detail: 'minimal', characterComposition: 'portrait' } });
  const result = await h.service.startLogoTextBatch('owner', h.snapshot(), request, 2);
  assert.equal(result.canvas_data.batches[0].planner.provider, 'local');
  assert.equal(result.canvas_data.batches[0].planner.reason, 'user-led-mascot');
  assert.equal(h.submissions.length, 2);
  assert.equal(h.charges.size, 2);
  for (const job of result.canvas_data.jobs) {
    assert.equal(job.provider, 'fal'); assert.equal(job.model, 'nano-banana-2.1');
    assert.equal(job.prompt, request.prompt);
    assert.ok(job.compiledPrompt.includes(request.prompt));
    assert.ok(h.submissions.some(s => s.request.input.prompt.endsWith(job.compiledPrompt)));
    assert.equal(job.status, 'queued');
    await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
  }
  assert.ok(h.snapshot().canvas_data.jobs.every(job => job.status === 'succeeded'));
});

test('all Text styles route consistently in direct and batched generation with only their own credentials', async () => {
  for (const { id: style } of LOGO_STYLES) {
    for (const batch of [false, true]) {
      const useNano = ['mascot', 'retro', 'icon', 'cartoon'].includes(style);
      const h = await serviceHarness(useNano ? { noRecraft: true } : { noFal: true });
      const request = input({ style });
      if (batch) await h.service.startLogoTextBatch('owner', h.snapshot(), request, 2);
      else await h.service.startLogoOperation('owner', h.snapshot(), request);
      const jobs = h.snapshot().canvas_data.jobs;
      assert.equal(jobs.length, batch ? 2 : 1);
      for (const job of jobs) {
        assert.equal(job.provider, useNano ? 'fal' : 'recraft', `${style}/${batch}`);
        assert.equal(job.model, useNano ? 'nano-banana-2.1' : 'recraftv4_1');
        assert.ok(h.submissions.every(submission => submission.endpoint === (useNano ? 'google/nano-banana-2.1' : 'images/generations')));
        assert.ok(h.submissions.every(submission => useNano ? submission.request.input.resolution === '1K' && !submission.request.input.image_urls : submission.request.input.size === '1024x1024'));
        assert.ok(h.submissions.every(submission => submission.request.input.prompt.includes(LOGO_STYLE_LANGUAGE[style].construction)), `${style}/${batch}: construction reaches the actual provider request`);
        assert.equal(job.creditCost, 8);
        await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
      }
      if (batch) await h.service.startLogoTextBatch('owner', h.snapshot(), request, 2);
      else await h.service.startLogoOperation('owner', h.snapshot(), request);
      assert.equal(h.submissions.length, jobs.length); assert.equal(h.charges.size, jobs.length);
      assert.equal(h.uploads.length, jobs.length);
      assert.ok(h.snapshot().canvas_data.jobs.every(job => job.status === 'succeeded'));
    }
  }
});

test('all four Nano Text styles preserve four-output billing, fixed seeds and frozen briefs through queue recovery and replay', async () => {
  for (const style of ['mascot', 'retro', 'icon', 'cartoon']) {
    const h = await serviceHarness({ noRecraft: true });
    const request = input({ style, brand: 'NEW NAME', tagline: '', prompt: 'An otter balancing one pebble.',
      designSettings: { detail: 'minimal', primaryColor: '#794931', backgroundColor: '#FFFFFF' },
      generationOptions: { conceptMode: 'faithful', seed: 4294967295 } });
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 4);
    const queued = h.snapshot().canvas_data.jobs;
    assert.equal(queued.length, 4); assert.equal(h.submissions.length, 4); assert.equal(h.charges.size, 4);
    assert.equal([...h.charges.values()].reduce((sum, charge) => sum + charge.amount, 0), 32);
    assert.deepEqual(h.submissions.map(s => s.request.input.seed), [4294967295, 0, 1, 2]);
    assert.equal(new Set(h.submissions.map(s => s.request.input.prompt)).size, 1);
    for (const job of queued) {
      assert.equal(job.status, 'queued'); assert.equal(job.provider, 'fal'); assert.equal(job.endpoint, 'google/nano-banana-2.1');
      assert.equal(job.model, 'nano-banana-2.1'); assert.equal(job.brand, request.brand); assert.equal(job.prompt, request.prompt);
      assert.deepEqual(job.designSettings, request.designSettings);
      const submitted = h.submissions.find(s => s.request.input.seed === job.seed).request.input;
      assert.equal(submitted.prompt, job.compiledPrompt); assert.equal(submitted.image_urls, undefined);
      assert.match(submitted.prompt, /NEW NAME/); assert.match(submitted.prompt, /#794931/);
      await Promise.all([h.service.refreshLogoJob('owner', h.snapshot(), job.id), h.service.refreshLogoJob('owner', h.snapshot(), job.id)]);
    }
    assert.equal(h.uploads.length, 4); assert.equal(h.refunded.size, 0);
    assert.ok(h.snapshot().canvas_data.jobs.every(j => j.status === 'succeeded' && j.format === 'png'));
    assert.ok(h.queueReads.every(q => q.endpoint === 'google/nano-banana-2.1'));
    const imageUsage = h.usages.filter(u => u.provider === 'fal');
    assert.equal(imageUsage.length, 4); assert.ok(imageUsage.every(u => u.estimatedCostUsd === null));
  }
});

test('Nano Text provider failures refund the original eight-credit charge once without a fallback generation', async () => {
  for (const failure of [{ providerFailure: true }, { resultError: new Error('Provider failed') }, { saveFailure: true }]) {
    const h = await serviceHarness({ ...failure, noRecraft: true });
    const request = input({ style: 'cartoon' });
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    const job = h.snapshot().canvas_data.jobs[0];
    await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
    await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
    await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
    assert.equal(h.snapshot().canvas_data.jobs[0].status, 'failed');
    assert.equal(h.charges.size, 1); assert.equal([...h.charges.values()][0].amount, 8);
    assert.equal(h.refunded.size, 1); assert.equal(h.submissions.length, 1);
    assert.equal(h.submissions[0].endpoint, 'google/nano-banana-2.1');
  }
});

test('Nano Text inspiration reaches Edit only as validated style guidance and retains private recipe metadata', async () => {
  for (const style of ['mascot', 'retro', 'icon', 'cartoon']) {
    for (const batch of [false, true]) {
      const h = await serviceHarness({ noRecraft: true });
      const request = input({ style, brand: 'ORIGINAL', styleReferenceUrl: 'https://storage.test/private-style.png',
        generationOptions: { seed: 7, styleMatch: 'precise' } });
      if (batch) await h.service.startLogoTextBatch('owner', h.snapshot(), request, 1);
      else await h.service.startLogoOperation('owner', h.snapshot(), request);
      const submission = h.submissions[0];
      assert.equal(submission.endpoint, 'google/nano-banana-2.1/edit');
      assert.deepEqual(submission.request.input.image_urls, ['data:image/png;base64,cG5n']);
      assert.match(submission.request.input.prompt, /Match the reference drawing language closely/);
      assert.match(submission.request.input.prompt, /Do not copy its subject, composition, brand name/);
      assert.match(submission.request.input.prompt, /ORIGINAL/);
      assert.equal(submission.request.input.seed, 7); assert.equal(submission.request.input.style_match, undefined);
      const job = h.snapshot().canvas_data.jobs[0];
      assert.equal(job.visualGuideResult.role, 'user-style-inspiration');
      assert.equal(job.visualGuideResult.match, 'precise'); assert.equal(job.visualGuideResult.referenceCount, 1);
      await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
      const publicJob = publicLogoProject(h.snapshot()).jobs[0];
      assert.equal(publicJob.hasStyleReference, true); assert.equal(publicJob.effectiveSeed, 7);
      assert.doesNotMatch(JSON.stringify(publicJob), /private-style|base64/);
      assert.equal(h.charges.size, 1); assert.equal([...h.charges.values()][0].amount, 8);
    }
    const invalid = await serviceHarness();
    await assert.rejects(invalid.service.startLogoTextBatch('owner', invalid.snapshot(), input({ style,
      styleReferenceUrl: 'https://foreign.test/style.png' }), 1), /own storage/);
    assert.equal(invalid.charges.size, 0); assert.equal(invalid.submissions.length, 0);
  }
});

test('missing selected provider credentials fail before any Text reservation, planner or credit charge', async () => {
  for (const { id: style } of LOGO_STYLES) {
    const h = await serviceHarness(['mascot', 'retro', 'icon', 'cartoon'].includes(style) ? { noFal: true } : { noRecraft: true });
    const request = input({ style });
    await assert.rejects(h.service.startLogoOperation('owner', h.snapshot(), request), /not configured/);
    await assert.rejects(h.service.startLogoTextBatch('owner', h.snapshot(), request, 2), /not configured/);
    assert.equal(h.charges.size, 0); assert.equal(h.submissions.length, 0);
    assert.equal(h.snapshot().canvas_data.jobs.length, 0);
  }
});

test('edits and Auto variations follow saved Streetwear identity through utilities despite stale style metadata', async () => {
  for (const style of ['mascot', STREETWEAR_STYLE]) {
    for (const operation of ['edit', 'variations']) {
      const streetwear = style === STREETWEAR_STYLE;
      const h = await serviceHarness(streetwear ? { noFal: true } : { noRecraft: true });
      const otherStyle = streetwear ? 'mascot' : STREETWEAR_STYLE;
      const original = { id: id(), operation: 'generate', mode: 'text', style, brand: 'ORIGINAL', status: 'succeeded', format: 'png', url: 'https://storage.test/original.png' };
      const edited = { ...original, id: id(), operation: 'edit', sourceId: original.id, brand: 'ACCEPTED', url: 'https://storage.test/edited.png' };
      const utility = { ...edited, id: id(), operation: 'removeBg', sourceId: edited.id, style: otherStyle, brand: 'STALE', url: 'https://storage.test/transparent.png' };
      h.change(project => project.canvas_data.jobs.push(original, edited, utility));
      const request = input({ operation, mode: 'image', style: otherStyle, sourceId: utility.id, prompt: 'Make the letters blue' });
      await h.service.startLogoOperation('owner', h.snapshot(), request);
      const job = h.snapshot().canvas_data.jobs.at(-1);
      assert.equal(job.style, style); assert.equal(job.brand, 'ACCEPTED'); assert.equal(job.mode, 'text');
      assert.equal(job.provider, streetwear ? 'recraft' : 'fal');
      const payload = h.submissions[0].request.input;
      assert.equal(streetwear ? payload.image_url : payload.image_urls[0], utility.url);
      assert.match(payload.prompt, /ACCEPTED/); assert.doesNotMatch(payload.prompt, /STALE/);
    }
  }
});

test('explicit variation style changes provider deliberately and subsequent edits follow the new saved style', async () => {
  for (const [from, target] of [[STREETWEAR_STYLE, 'retro'], ['retro', STREETWEAR_STYLE]]) {
    const h = await serviceHarness();
    const root = { id: id(), operation: 'generate', mode: 'text', style: from, brand: 'PEAK', status: 'succeeded', format: 'png', url: 'https://storage.test/original.png' };
    h.change(project => project.canvas_data.jobs.push(root));
    await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'variations', sourceId: root.id, variationStyle: target }));
    const variation = h.snapshot().canvas_data.jobs.at(-1);
    assert.equal(variation.style, target);
    assert.equal(variation.provider, target === STREETWEAR_STYLE ? 'recraft' : 'fal');
    await h.service.refreshLogoJob('owner', h.snapshot(), variation.id);
    await h.service.startLogoOperation('owner', h.snapshot(), input({ operation: 'edit', sourceId: variation.id, style: from, prompt: 'Make the letters blue' }));
    const edit = h.snapshot().canvas_data.jobs.at(-1);
    assert.equal(edit.style, target); assert.equal(edit.provider, variation.provider);
    assert.equal(h.charges.size, 2); assert.equal(h.submissions.length, 2);
  }
});

test('Badge directions freeze before billing and survive direct/batch generation, refresh and public history', async () => {
  const designSettings = { badgeDirection: 'modern-club', badgeShape: 'shield', badgeSubject: 'full-body', badgeView: 'profile', badgeLayout: 'integrated', badgeDetail: 'minimal' };
  for (const batch of [false, true]) for (const artDirection of [false, true]) {
    const h = await serviceHarness({ noFal: true, artDirection });
    const request = input({ style: 'badge', brand: 'WK', prompt: 'a badge with a minimal goat', designSettings });
    if (batch) await h.service.startLogoTextBatch('owner', h.snapshot(), request, 2);
    else await h.service.startLogoOperation('owner', h.snapshot(), request);
    const reserved = h.snapshot().canvas_data.jobs;
    for (const job of reserved) {
      assert.deepEqual(job.designSettings, designSettings);
      assert.equal(job.compilerVersion, logoCompilerVersion('badge'));
      assert.match(job.compiledPrompt, /Modern club crest/);
      assert.match(job.compiledPrompt, /Side profile/);
      assert.ok(h.submissions.some(s => s.request.input.prompt.endsWith(job.compiledPrompt)));
      assert.equal(job.provider, 'recraft'); assert.equal(job.model, 'recraftv4_1');
      await h.service.refreshLogoJob('owner', h.snapshot(), job.id);
    }
    for (const job of publicLogoProject(h.snapshot()).jobs) {
      assert.deepEqual(job.designSettings, designSettings); assert.equal(job.status, 'succeeded');
    }
    assert.equal(h.charges.size, reserved.length); assert.equal(h.uploads.length, reserved.length);
  }
});
