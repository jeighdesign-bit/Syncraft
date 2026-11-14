import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const live = JSON.parse(readFileSync(new URL('./fixtures/live-extraction-prompts.json', import.meta.url)));

function inspectSelection(setting) {
  const env = { ...process.env };
  delete env.GARMENT_EXTRACTION_PROMPT_VERSION;
  if (setting !== undefined) env.GARMENT_EXTRACTION_PROMPT_VERSION = setting;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
    import * as active from './src/lib/garmentPromptRules.mjs';
    import { createHash } from 'node:crypto';
    const hash = text => createHash('sha256').update(text).digest('hex');
    console.log(JSON.stringify({
      version: active.GARMENT_PROMPT_VERSION,
      modes: Object.fromEntries(['ERASE_LOGOS','PRESERVE_LOGOS'].map(mode => [mode, {
        prompt: hash(active.buildGarmentExtractionPrompt(mode)),
        guard: hash(active.buildGarmentFlexibilityGuard(mode)),
      }])),
      system: hash(active.buildGarmentExtractionSystemPrompt()),
      surface: hash(active.buildGarmentSurfaceContract()),
      legacyFallback: active.resolveGarmentPromptMode({trace_type:'mockup',ai_prompt:null}),
    }));
  `], { env, encoding: 'utf8' }));
}

test('retired experimental prompt flags cannot change the verified production garment rules', () => {
  for (const setting of [undefined, '', 'reconstruction-v10', 'reconstruction-v999', 'artwork-restoration-v11']) {
    const result = inspectSelection(setting);
    assert.equal(result.version, live.garment.version);
    assert.deepEqual(result.modes, live.garment.modes);
    assert.equal(result.system, live.garment.system);
    assert.equal(result.surface, live.garment.surface);
    assert.equal(result.legacyFallback, 'PRESERVE_LOGOS');
  }
});
