import test from "node:test";
import assert from "node:assert/strict";
import { CREDIT_PLANS, getCreditPlan, getPolarCheckoutPricing } from "../src/lib/paymentPlans.js";
import { checkoutCreateToJSON } from "@polar-sh/sdk/models/components/checkoutcreate.js";

const expectedPlans = {
  tingi: { amount: 7900, credits: 24, generations: 2 },
  basic: { amount: 18900, usdAmount: 349, credits: 60, generations: 5 },
  starter: { amount: 39900, usdAmount: 749, credits: 168, generations: 14 },
  pro: { amount: 64900, usdAmount: 1199, credits: 288, generations: 24 },
  elite: { amount: 114900, usdAmount: 2099, credits: 528, generations: 44 },
};

test("finalized PHP plans preserve exact 12-credit generation allowances", () => {
  for (const [key, expected] of Object.entries(expectedPlans)) {
    const plan = CREDIT_PLANS[key];
    assert.equal(plan.amount, expected.amount, `${key} amount`);
    assert.equal(Number(plan.price.replace(/[^0-9.]/g, "")) * 100, expected.amount, `${key} display price`);
    assert.equal(plan.gcashPrice, plan.price);
    assert.equal(plan.credits, expected.credits, `${key} credits`);
    assert.equal(plan.credits / 12, expected.generations, `${key} generations`);
  }
});

test("Polar serializes the displayed USD prices as fixed checkout overrides", () => {
  for (const [key, expected] of Object.entries(expectedPlans)) {
    if (!expected.usdAmount) continue;
    const plan = CREDIT_PLANS[key];
    const productId = `product-${key}`;
    const payload = JSON.parse(checkoutCreateToJSON(getPolarCheckoutPricing(plan, productId)));
    assert.equal(plan.polarPrice, `$${(expected.usdAmount / 100).toFixed(2)}`);
    assert.deepEqual(payload.products, [productId]);
    assert.equal(payload.currency, "usd");
    assert.deepEqual(payload.prices[productId], [{
      amount_type: "fixed",
      price_amount: expected.usdAmount,
      price_currency: "usd",
    }]);
    assert.equal(payload.amount, undefined, "fixed products must use prices, not the ignored amount field");
  }
});

test("Tingi stays PHP-only and missing Polar products fail before checkout", () => {
  assert.equal(CREDIT_PLANS.tingi.polarEnabled, false);
  assert.throws(() => getPolarCheckoutPricing(CREDIT_PLANS.tingi, "product-tingi"), /Invalid Polar/);
  assert.throws(() => getPolarCheckoutPricing(CREDIT_PLANS.pro, null), /Invalid Polar/);
});

test("plan lookup remains case-insensitive", () => {
  assert.equal(getCreditPlan("ELITE"), CREDIT_PLANS.elite);
  assert.equal(getCreditPlan("missing"), null);
});
