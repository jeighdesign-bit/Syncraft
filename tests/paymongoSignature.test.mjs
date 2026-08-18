import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { verifyPaymongoSignature } from "../src/lib/paymongo.js";

test("verifyPaymongoSignature successfully validates live/test signatures with timestamp", () => {
  const webhookSecret = "whsec_test_secret_12345";
  const rawBody = JSON.stringify({
    data: {
      id: "evt_test123",
      type: "event",
      attributes: {
        type: "checkout_session.payment.paid",
      },
    },
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const header = `t=${timestamp},te=${signature},li=`;
  const isValid = verifyPaymongoSignature(rawBody, header, webhookSecret);
  assert.equal(isValid, true, "Signature should be valid for test signature");

  const liveHeader = `t=${timestamp},te=,li=${signature}`;
  const isLiveValid = verifyPaymongoSignature(rawBody, liveHeader, webhookSecret);
  assert.equal(isLiveValid, true, "Signature should be valid for live signature");
});

test("verifyPaymongoSignature rejects tampered body or invalid secret", () => {
  const webhookSecret = "whsec_test_secret_12345";
  const rawBody = JSON.stringify({ data: { id: "evt_1" } });
  const tamperedBody = JSON.stringify({ data: { id: "evt_2" } });

  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");

  const header = `t=${timestamp},te=${signature}`;

  assert.equal(
    verifyPaymongoSignature(tamperedBody, header, webhookSecret),
    false,
    "Tampered body must fail verification",
  );

  assert.equal(
    verifyPaymongoSignature(rawBody, header, "wrong_secret"),
    false,
    "Wrong secret must fail verification",
  );
});

test("verifyPaymongoSignature returns false on empty arguments", () => {
  assert.equal(verifyPaymongoSignature("", "sig", "secret"), false);
  assert.equal(verifyPaymongoSignature("body", "", "secret"), false);
  assert.equal(verifyPaymongoSignature("body", "sig", ""), false);
});
