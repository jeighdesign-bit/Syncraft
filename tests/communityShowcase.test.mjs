import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const source = await readFile(new URL('../src/app/components/CommunityShowcase.js', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS } }).outputText;
const exports = {};
vm.runInNewContext(code, { exports, require(name) {
  if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_object, key) => String(key) }) };
  if (name === 'next/link') return { __esModule: true, default: props => React.createElement('a', props) };
  if (name === './SectionBadge') return { __esModule: true, default: props => React.createElement('span', props) };
  return require(name);
} });
const businesses = Array.from({ length: 6 }, (_value, index) => ({ id: String(index), business_name: `Print Shop ${index + 1}`, website: `https://example.com/shop-${index}`, logo_url: `/api/community/logo?id=${index}` }));
const render = rows => renderToStaticMarkup(React.createElement(exports.CommunityLogos, { businesses: rows }));

test('the entire community section is absent when there are no approved businesses', () => {
  assert.equal(render([]), '');
});

test('the homepage starts without a community section or sample placeholders', () => {
  assert.equal(renderToStaticMarkup(React.createElement(exports.default)), '');
});

test('a small community uses a minimal logo row with accessible business names and destination links', () => {
  const html = render(businesses.slice(0, 2));
  assert.match(html, /Meet Our Community/);
  assert.doesNotMatch(html, /Submit your logo|Discover sublimation|Independently owned/);
  assert.equal((html.match(/<li>/g) || []).length, 2);
  assert.doesNotMatch(html, /Pause scrolling|<ul[^>]+aria-hidden="true"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /alt="Print Shop 1"/);
  assert.doesNotMatch(html, /<span>Print Shop/);
});

test('a full marquee provides pause control and excludes loop duplicates from keyboard and accessibility navigation', () => {
  const html = render(businesses);
  assert.match(html, /Pause scrolling/);
  assert.match(html, /aria-pressed="false"/);
  assert.equal((html.match(/<li>/g) || []).length, 12);
  assert.equal((html.match(/tabindex="-1"/g) || []).length, 6);
  assert.match(html, /<ul[^>]+aria-hidden="true"/);
});
