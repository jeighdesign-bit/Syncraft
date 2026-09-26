import test from "node:test";
import assert from "node:assert/strict";
import { B2B_CREDIT_PLANS, getB2bCreditPlan } from "../src/lib/b2bPaymentPlans.js";

test("B2B API packages preserve the published peso pricing", () => {
  assert.deepEqual(
    Object.values(B2B_CREDIT_PLANS).map(({ key, credits, amount }) => ({ key, credits, amount })),
    [
      { key: "starter", credits: 200, amount: 11600 },
      { key: "pro", credits: 500, amount: 29000 },
      { key: "studio", credits: 1000, amount: 58000 },
    ],
  );
});

test("B2B API plan lookup is case-insensitive and rejects unknown packages", () => {
  assert.equal(getB2bCreditPlan("STUDIO")?.credits, 1000);
  assert.equal(getB2bCreditPlan("custom"), null);
});

