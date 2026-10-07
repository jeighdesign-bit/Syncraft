import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [modalSource, entitlementSql] = await Promise.all([
  readFile(new URL("../src/components/TopUpModal.js", import.meta.url), "utf8"),
  readFile(new URL("../database/setup_elite_desaynscale_automation.sql", import.meta.url), "utf8"),
]);

test("Elite pricing advertises lifetime upscaling without a slot limit", () => {
  assert.match(modalSource, /INCLUDED WITH ₱899 ELITE/);
  assert.doesNotMatch(modalSource, /FIRST 10 ELITE BUYERS|slots? left/i);
});

test("Elite entitlement SQL grants access without a ten-buyer cutoff", () => {
  assert.doesNotMatch(entitlementSql, /used_slots\s*>=\s*10/i);
  assert.match(entitlementSql, /claim_payment_source NOT IN \('gcash', 'paymongo', 'dodo', 'polar'\)/);
  assert.match(entitlementSql, /CHECK \(claim_number > 0\)/);
});
