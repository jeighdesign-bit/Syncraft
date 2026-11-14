import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_EXTRACTION_RESOLUTION, EXTRACTION_RESOLUTIONS, extractionResolution, extractionCredits, extractionDisplayName } from '../src/lib/extractionResolution.mjs';

test('the default and all extraction tiers use the approved 1K/12, 2K/16 and 4K/24 policy', () => {
  assert.equal(DEFAULT_EXTRACTION_RESOLUTION, '1K');
  assert.equal(extractionResolution(), '1K');
  assert.equal(extractionCredits(), 12);
  assert.equal(extractionDisplayName(), 'Syncraft V1');
  assert.deepEqual(EXTRACTION_RESOLUTIONS.map(({ value, credits }) => [value, credits]), [['1K', 12], ['2K', 16], ['4K', 24]]);
  for (const traceType of ['mockup', 'logo', 'universal']) {
    for (const [resolution, cost] of [['1K', 12], ['2K', 16], ['4K', 24]]) {
      assert.equal(extractionResolution(resolution), resolution);
      assert.equal(extractionCredits(resolution, traceType), cost);
    }
  }
});

test('malformed tiers cannot obtain an implicit downgrade or choose their own price', () => {
  for (const tier of ['', null, '1k', '8K', 1, {}, ['4K']]) {
    assert.throws(() => extractionResolution(tier), { code: 'INVALID_EXTRACTION_RESOLUTION' });
    assert.throws(() => extractionCredits(tier), { code: 'INVALID_EXTRACTION_RESOLUTION' });
  }
});
