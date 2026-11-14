import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { ARTWORK_GENERATION_MODEL } from '../src/lib/falArtworkGeneration.mjs';
import { ARTWORK_EDIT_MODEL } from '../src/lib/artworkEditPolicy.mjs';
import { RECOVERY_IMAGE_ENDPOINT } from '../src/lib/recoveryVision.mjs';
import { UNIVERSAL_AVAILABLE } from '../src/lib/universalAvailability.mjs';
import { LOGO_STYLES, LOGO_BATCH_LIMIT, logoOperationCost } from '../src/lib/logoStudio.mjs';
import { logoUsesNano } from '../src/lib/logoModelRouting.mjs';
import { EXTRACTION_RESOLUTIONS } from '../src/lib/extractionResolution.mjs';
import { CREDIT_COST } from '../src/lib/pricing.js';

test('live release verification reports the deployed commit and actual model/pricing contracts without caching', async () => {
  const source = (await readFile(new URL('../src/app/api/version/route.js', import.meta.url), 'utf8'))
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  for (const env of [{ VERCEL_GIT_COMMIT_SHA: 'deployed-sha', VERCEL_GIT_COMMIT_REF: 'main', SYNCRAFT_RELEASE_COMMIT: 'fallback-sha' },
    { SYNCRAFT_RELEASE_COMMIT: 'fallback-sha' }, {}]) {
    const context = vm.createContext({ ARTWORK_GENERATION_MODEL, ARTWORK_EDIT_MODEL, RECOVERY_IMAGE_ENDPOINT,
      UNIVERSAL_AVAILABLE, LOGO_STYLES, LOGO_BATCH_LIMIT, logoOperationCost, logoUsesNano, EXTRACTION_RESOLUTIONS, CREDIT_COST, Response, process: { env } });
    const GET = vm.runInContext(`${source}\nGET`, context);
    const response = GET(); const body = await response.json();
    assert.equal(body.commit, env.VERCEL_GIT_COMMIT_SHA || env.SYNCRAFT_RELEASE_COMMIT || null);
    assert.equal(body.branch, env.VERCEL_GIT_COMMIT_REF || null);
    assert.equal(body.release, 'extraction-tiers-credits-community-legal-2026-11-14');
    assert.deepEqual(body.extraction.tiers, JSON.parse(JSON.stringify(EXTRACTION_RESOLUTIONS)));
    assert.equal(body.extraction.native4KSkipsUpscale, true);
    assert.deepEqual(body.workspaceActionCredits, {aiEdit: 4, removeBg: 2, extendDesign: 6});
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(body.logoStudio.batchLimit, 4);
    assert.equal(Object.keys(body.logoStudio.textModels).length, 13);
    assert.deepEqual(Object.keys(body.logoStudio.textModels).filter(style => body.logoStudio.textModels[style] === 'nano-banana-2.1').sort(), ['cartoon', 'icon', 'mascot', 'retro']);
    assert.deepEqual(body.logoStudio.credits, { generate: 8, variations: 6, edit: 8, removeBg: 2, vectorize: 2 });
    assert.equal(body.models.extraction, ARTWORK_GENERATION_MODEL);
    assert.equal(body.models.aiEdit, ARTWORK_EDIT_MODEL);
    assert.equal(body.logoStudio.referenceModel, 'google/nano-banana-2.1/edit');
  }
});
