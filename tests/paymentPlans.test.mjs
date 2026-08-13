import test from "node:test";
import assert from "node:assert/strict";
import { CREDIT_PLANS, getCreditPlan } from "../src/lib/paymentPlans.js";

const expectedPlans = {
  tingi: { amount: 6000, credits: 24, generations: 2 },
  basic: { amount: 14900, credits: 60, generations: 5 },
  starter: { amount: 29900, credits: 168, generations: 14 },
  pro: { amount: 49900, credits: 288, generations: 24 },
  elite: { amount: 89900, credits: 528, generations: 44 },
};

test("finalized PHP plans preserve exact 12-credit generation allowances", () => {
  for (const [key, expected] of Object.entries(expectedPlans)) {
    const plan = CREDIT_PLANS[key];
    assert.equal(plan.amount, expected.amount, `${key} amount`);
    assert.equal(plan.credits, expected.credits, `${key} credits`);
    assert.equal(plan.credits / 12, expected.generations, `${key} generations`);
  }
});

test("plan lookup remains case-insensitive", () => {
  assert.equal(getCreditPlan("ELITE"), CREDIT_PLANS.elite);
  assert.equal(getCreditPlan("missing"), null);
});
