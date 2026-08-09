import test from "node:test";
import assert from "node:assert/strict";

import { CREDIT_COST } from "../src/lib/pricing.js";

test("Universal extraction charges twice the standard trace cost", () => {
  assert.equal(CREDIT_COST.trace, 12);
  assert.equal(CREDIT_COST.universal, 24);
});
