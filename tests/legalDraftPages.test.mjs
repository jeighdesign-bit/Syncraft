import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const drafts = JSON.parse(await readFile(new URL('../src/content/legalDrafts.json', import.meta.url), 'utf8'));
const source = await readFile(new URL('../src/components/LegalDraftPage.js', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { fileName: 'LegalDraftPage.jsx', compilerOptions: {
  jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022,
} }).outputText;
const anchor = { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) };
const dependencies = {
  'next/link': anchor, './BackLink': anchor, '@/content/legalDrafts.json': drafts,
  './LegalDraftPage.module.css': { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) },
};
const module = { exports: {} };
vm.runInNewContext(code, { module, exports: module.exports, require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name) });
const normalize = text => text.replace(/\s+/g, ' ').trim();
const plainText = html => normalize(html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'));

const policyFiles = { terms: 'terms-of-service.txt', refunds: 'refund-and-payment-policy.txt', privacy: 'privacy-policy.txt', copyright: 'copyright-policy.txt', 'acceptable-use': 'acceptable-use-policy.txt' };
for (const [key, file] of Object.entries(policyFiles)) {
  test(`${key} page renders the complete policy, effective date and owner-supplied contact details`, async () => {
    const original = await readFile(new URL(`../docs/legal-drafts/2026-11-11/${file}`, import.meta.url), 'utf8');
    assert.equal(drafts[key], original);
    const html = renderToStaticMarkup(React.createElement(module.exports.default, { policy: key }));
    const rendered = plainText(html);
    const [header, ...blocks] = original.trim().split(/\r?\n\s*\r?\n/);
    for (const line of header.split(/\r?\n/).slice(1)) assert.ok(rendered.includes(normalize(line)), line);
    for (const block of blocks) {
      const heading = block.match(/^(\d+)\. (.+)$/);
      if (heading) assert.ok(rendered.includes(`Section ${heading[1]}${heading[2]}`), heading[0]);
      else for (const line of block.split('\n')) assert.ok(rendered.includes(normalize(line.replace(/^- /, '').replaceAll('/copyright-takedown', 'Copyright Takedown Request'))), line);
    }
    assert.match(rendered, /JAY LUIS CAÑO/);
    assert.match(rendered, /jeighdesign@gmail\.com/);
    assert.match(rendered, /Effective date: 11 November 2026/);
    assert.doesNotMatch(rendered, /DRAFT FOR|Not set|This draft|following proposed|before this draft takes effect/);
    assert.doesNotMatch(html, /aria-label="Draft status"|Legal policy drafts/);
    assert.doesNotMatch(html, /\[LEGAL BUSINESS NAME\]|\[SUPPORT EMAIL\]/);
    assert.match(html, new RegExp(`href="/${key}" aria-current="page"`));
    for (const destination of Object.keys(policyFiles)) assert.ok(html.includes(`href="/${destination}"`));
    assert.equal((html.match(/<h1>/g) || []).length, 1);
    if (key !== 'terms') assert.ok(html.includes('<ul'));
    if (key === 'copyright') {
      assert.match(html, /href="\/copyright-takedown"/);
      assert.match(rendered, /Syncraft does not claim ownership of your uploads or outputs/);
      assert.match(rendered, /good-faith complaint, response or payment dispute is not by itself grounds for automatic forfeiture/);
    }
    if (key === 'acceptable-use') {
      assert.match(rendered, /An account restriction does not automatically forfeit every unused credit/);
      assert.match(rendered, /Nothing here removes mandatory consumer rights/);
    }
  });
}
