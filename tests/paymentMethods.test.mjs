import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { MANUAL_GCASH_ENABLED } from "../src/lib/paymentMethods.mjs";

const [modalSource, submitRouteSource] = await Promise.all([
  readFile(new URL("../src/components/TopUpModal.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app/api/payments/gcash/submit/route.js", import.meta.url), "utf8"),
]);

test("manual GCash is disabled across the customer UI and submission API", () => {
  assert.equal(MANUAL_GCASH_ENABLED, false);
  assert.match(modalSource, /MANUAL_GCASH_ENABLED && <button/);
  assert.match(submitRouteSource, /if \(!MANUAL_GCASH_ENABLED\)/);
  assert.match(submitRouteSource, /status: 410/);
});
