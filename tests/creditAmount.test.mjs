import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { creditAmountModule, plainText } from './helpers/creditAmount.mjs';

test('credit amounts use the existing decorative Syncraft bolt and retain readable units', () => {
  for (const amount of [0, 8, 12, 16, 24, '-12', '+24', '1,000']) {
    const html = renderToStaticMarkup(React.createElement(creditAmountModule.default, { amount }));
    assert.equal(plainText(html), `${amount} credits`);
    assert.equal((html.match(/<svg/g) || []).length, 1);
    assert.match(html, /width="12" height="12"[^>]*aria-hidden="true"[^>]*focusable="false"/);
    assert.match(html, /m9\.5 1\.5-7 8h5l-1 5 7-8h-5l1-5Z/);
    const compact = renderToStaticMarkup(React.createElement(creditAmountModule.default, { amount, unit: '' }));
    assert.match(compact, /class="sr-only"> credits<\/span>/);
    assert.equal(plainText(compact), `${amount} credits`);
  }
});
