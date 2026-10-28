import test from "node:test";
import assert from "node:assert/strict";
import { getSignInDestination } from "../src/lib/authNavigation.mjs";

const origin = "http://localhost:3000";

test("completed login defaults to the workspace", () => {
  assert.equal(getSignInDestination(origin, null).href, `${origin}/workspace`);
  assert.equal(getSignInDestination(origin, "").href, `${origin}/workspace`);
});

test("explicit internal destinations preserve their path and query", () => {
  assert.equal(getSignInDestination(origin, "/logo-studio?example=orbit-robot").href, `${origin}/logo-studio?example=orbit-robot`);
  assert.equal(getSignInDestination(origin, "/").href, `${origin}/`);
});

test("unsafe login destinations fall back to the workspace", () => {
  for (const next of ["https://example.com/", "//example.com/", "javascript:alert(1)", "http://user:pass@localhost:3000/"]) {
    assert.equal(getSignInDestination(origin, next).href, `${origin}/workspace`);
  }
});
