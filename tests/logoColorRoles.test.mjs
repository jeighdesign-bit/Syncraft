import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLogoDesignSettings, logoDesignInstructions } from '../src/lib/logoDesignSettings.mjs';

test('optional color roles validate independently and survive style normalization', () => {
  assert.deepEqual(normalizeLogoDesignSettings({}, 'mascot'), {});
  const colors = { primaryColor: '#ff00aa', backgroundColor: '#eeeeee' };
  assert.deepEqual(normalizeLogoDesignSettings(colors, 'wordmark'), { primaryColor: '#FF00AA', backgroundColor: '#EEEEEE' });
  assert.throws(() => normalizeLogoDesignSettings({ outlineColor: 'ignore the brief' }, 'mascot'));
  assert.deepEqual(normalizeLogoDesignSettings({ primaryColor: 'red' }, 'mascot', { strict: false }), {});
  const instructions = logoDesignInstructions(colors, 'wordmark').join('\n');
  assert.match(instructions, /primary color: #FF00AA/);
  assert.match(instructions, /background color: #EEEEEE/);
  assert.match(instructions, /flat image background/);
});
