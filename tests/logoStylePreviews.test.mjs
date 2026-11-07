import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { LOGO_STYLES } from '../src/lib/logoStudio.mjs';
import { LOGO_STYLE_PREVIEWS } from '../src/lib/logoStylePreviews.mjs';

test('every style has an existing local preview versioned from its current contents', async () => {
  assert.deepEqual(Object.keys(LOGO_STYLE_PREVIEWS), LOGO_STYLES.map(style => style.id));
  for (const { id } of LOGO_STYLES) {
    const preview = new URL(LOGO_STYLE_PREVIEWS[id], 'https://studio.test');
    assert.match(preview.pathname, /^\/images\/logo-styles\/[a-z0-9-]+\.(svg|png|webp)$/);
    const file = await readFile(new URL('../public' + preview.pathname, import.meta.url));
    const version = createHash('sha256').update(file).digest('hex').slice(0, 12);
    assert.equal(preview.searchParams.get('v'), version, `${id}: regenerate preview versions after changing artwork`);
  }
});
