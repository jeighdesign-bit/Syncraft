import test from "node:test";
import assert from "node:assert/strict";
import { signArtworkEditState, verifyArtworkEditState } from "../src/lib/artworkEditIntegrity.mjs";
test("signed edit jobs survive JSONB key reordering but reject altered billing/state", () => {
  const data = { jobs: [{ status: "queued", chargeId: "charge", id: "request" }], versions: [] };
  const signature = signArtworkEditState("project", data, "test-secret");
  assert.equal(verifyArtworkEditState("project", { versions: [], signature, jobs: [{ id: "request", chargeId: "charge", status: "queued" }] }, "test-secret"), true);
  assert.equal(verifyArtworkEditState("project", { ...data, signature, jobs: [{ ...data.jobs[0], status: "failed" }] }, "test-secret"), false);
  assert.equal(verifyArtworkEditState("different-project", { ...data, signature }, "test-secret"), false);
  assert.equal(verifyArtworkEditState("project", data, "test-secret"), false);
  assert.equal(verifyArtworkEditState("project", null, "test-secret"), true);
});
