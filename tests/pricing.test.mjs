import test from "node:test";
import assert from "node:assert/strict";

import { CREDIT_COST } from "../src/lib/pricing.js";
import { CREDIT_PLANS } from "../src/lib/paymentPlans.js";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import vm from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

test("Universal extraction charges twice the standard trace cost", () => {
  assert.equal(CREDIT_COST.trace, 12);
  assert.equal(CREDIT_COST.universal, 24);
});

test("only Logo Studio variations receive the six-credit price", () => {
  assert.deepEqual(CREDIT_COST, {
    trace: 12, universal: 24, removeBg: 12, upscale: 12, extend: 12, artworkEdit: 8,
    logoGenerate: 8, logoImageGenerate: 8, logoSketchGenerate: 8,
    logoVariations: 6, logoEdit: 8, logoRemoveBg: 2, logoVectorize: 2,
  });
});

async function renderPricingComponent(name, props = {}) {
  const source = await readFile(new URL(`../src/app/components/${name}.js`, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { fileName: `${name}.jsx`, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true,
  } }).outputText;
  const require = createRequire(import.meta.url);
  const module = { exports: {} };
  const dependencies = {
    "@/lib/pricing": { CREDIT_COST }, "@/lib/paymentPlans": { CREDIT_PLANS },
    "@/components/CurrencyToggle": { __esModule: true, default: () => null },
    "./SectionBadge": { __esModule: true, default: ({ children }) => React.createElement("span", null, children) },
    [`./${name}.module.css`]: { __esModule: true, default: {} },
  };
  vm.runInNewContext(code, { module, exports: module.exports,
    require: name => Object.hasOwn(dependencies, name) ? dependencies[name] : require(name),
  });
  return renderToStaticMarkup(React.createElement(module.exports.default, props));
}

test("homepage and compact Pricing show six-credit variations with accurate package allowances", async () => {
  for (const compact of [false, true]) {
    const html = await renderPricingComponent("PricingSection", { compact });
    assert.match(html, /creation uses 8 credits per logo; variations use 6 credits per output; standard extraction uses 12/);
    for (const plan of Object.values(CREDIT_PLANS)) {
      assert.ok(html.includes(`<strong>${Math.floor(plan.credits / 6)} logo variations</strong>`));
      assert.ok(html.includes(`<strong>${Math.floor(plan.credits / 8)} logos</strong>`));
    }
  }
});

test("the credit FAQ distinguishes six-credit variations from eight-credit creation and AI edit", async () => {
  const html = await renderPricingComponent("FAQSection");
  assert.match(html, /creation or AI edit costs 8 credits per output; variations cost 6 credits per output/);
});
