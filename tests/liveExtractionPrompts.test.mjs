import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import * as garment from '../src/lib/garmentPromptRules.mjs';
import * as recovery from '../src/lib/recoveryVision.mjs';
import * as strip from '../src/lib/recoveryStrip.mjs';
import { ARTWORK_GENERATION_MODEL } from '../src/lib/falArtworkGeneration.mjs';
import { buildLogoExtractionPrompt } from '../src/lib/logoExtractionPrompt.mjs';

// Captured from the Git source of the deployment actually assigned to
// syncraftech.com, verified against both Vercel's production target and alias.
// Prompt hashes intentionally exclude resolution, billing and UI settings.
const live = JSON.parse(await readFile(new URL('./fixtures/live-extraction-prompts.json', import.meta.url)));
const hash = text => createHash('sha256').update(text).digest('hex');
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');

function logoLiteral(source) {
  const ast = ts.createSourceFile('route.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const literals = [];
  const visit = node => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text.startsWith('You are a FORENSIC LOGO REPRODUCTION ARTIST.')) literals.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.equal(literals.length, 1);
  return literals[0];
}

test('garment extraction uses exactly the prompts from the verified live deployment', () => {
  assert.equal(garment.GARMENT_PROMPT_VERSION, live.garment.version);
  assert.equal(ARTWORK_GENERATION_MODEL, live.model);
  assert.equal(hash(garment.buildGarmentExtractionSystemPrompt()), live.garment.system);
  assert.equal(hash(garment.buildGarmentSurfaceContract()), live.garment.surface);
  for (const [mode, expected] of Object.entries(live.garment.modes)) {
    assert.equal(hash(garment.buildGarmentExtractionPrompt(mode)), expected.prompt, mode);
    assert.equal(hash(garment.buildGarmentFlexibilityGuard(mode)), expected.guard, mode);
  }
});

test('consumer and B2B Logo Extraction preserve their exact deployed instructions', async () => {
  assert.equal(hash(buildLogoExtractionPrompt()), live.logo.consumer);
  assert.equal(hash(logoLiteral(await read('src/app/api/v1/generate/route.js'))), live.logo.b2b);
});

test('all Universal extraction categories and both content modes retain live prompts at 1K, 2K and 4K', () => {
  assert.equal(recovery.RECOVERY_IMAGE_ENDPOINT, live.universal.model);
  assert.equal(recovery.RECOVERY_DIRECT_CROP_PROMPT_VERSION, live.universal.directCropVersion);
  for (const fixture of live.universal.cases) {
    for (const resolution of ['1K', '2K', '4K']) {
      const input = recovery.buildRecoveryImageInput({ ...fixture.args, resolution });
      assert.equal(hash(input.prompt), fixture.prompt, `${fixture.args.mode}/${fixture.args.analysis.reference_category}/${fixture.args.directCrop}/${resolution}`);
      assert.equal(input.resolution, resolution);
      assert.deepEqual(input.image_urls, fixture.args.imageUrls);
    }
    assert.equal(hash(recovery.visualRecoveryPrompt(fixture.args.analysis, fixture.args.mode)), fixture.review);
  }
  for (const [mode, expected] of Object.entries(live.universal.modes)) assert.equal(hash(recovery.recoveryModeInstructions(mode)), expected);
});

test('Universal category, inspection and strip prompt builders match the live versions', () => {
  for (const fixture of live.universal.analysis) assert.equal(hash(recovery.surfaceAnalysisPrompt(fixture.category)), fixture.prompt);
  for (const fixture of live.universal.inspection) assert.equal(hash(recovery.recoveryInspectionSystemPrompt(fixture.layout)), fixture.prompt);
  for (const fixture of live.strip) {
    assert.equal(hash(strip.stripEditInstructions(fixture.strip)), fixture.instructions);
    for (const resolution of ['1K', '2K', '4K']) {
      const input = strip.buildStripRecoveryInput({ image_urls: ['source'], resolution }, fixture.strip, fixture.mode);
      assert.equal(hash(input.prompt), fixture.prompt);
      assert.equal(input.resolution, resolution);
    }
  }
});

test('application extraction no longer imports experimental prompt or cleanup builders', async () => {
  for (const file of ['src/lib/garmentPromptRules.mjs', 'src/app/api/trace/route.js', 'src/app/api/v1/generate/route.js']) {
    assert.doesNotMatch(await read(file), /garmentPromptCandidate|garmentFlatCleanup|refineGarmentFlatArtwork|GARMENT_EXTRACTION_PROMPT_VERSION|GARMENT_FLAT_CLEANUP_ENABLED/, file);
  }
});
