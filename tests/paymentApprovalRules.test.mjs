import test from "node:test";
import assert from "node:assert/strict";
import {
  PAYMENT_STATUS,
  addsCreditsForStatus,
  appearsInManualPaymentHistory,
  countsAsManualRevenue,
  getApprovalStatus,
} from "../src/lib/paymentApprovalRules.mjs";

test("Approve & add credits is revenue-bearing", () => {
  const status = getApprovalStatus(false);
  assert.equal(status, PAYMENT_STATUS.APPROVED);
  assert.equal(addsCreditsForStatus(status), true);
  assert.equal(countsAsManualRevenue(status), true);
  assert.equal(appearsInManualPaymentHistory(status), true);
});

test("Already paid is recorded without credits or revenue", () => {
  const status = getApprovalStatus(true);
  assert.equal(status, PAYMENT_STATUS.ALREADY_PAID);
  assert.equal(addsCreditsForStatus(status), false);
  assert.equal(countsAsManualRevenue(status), false);
  assert.equal(appearsInManualPaymentHistory(status), true);
});

test("Only the literal boolean true can select mark-only behavior", () => {
  assert.equal(getApprovalStatus("true"), PAYMENT_STATUS.APPROVED);
  assert.equal(getApprovalStatus(1), PAYMENT_STATUS.APPROVED);
  assert.equal(getApprovalStatus(undefined), PAYMENT_STATUS.APPROVED);
});

test("Pending requests never appear in revenue or history", () => {
  assert.equal(addsCreditsForStatus(PAYMENT_STATUS.PENDING), false);
  assert.equal(countsAsManualRevenue(PAYMENT_STATUS.PENDING), false);
  assert.equal(appearsInManualPaymentHistory(PAYMENT_STATUS.PENDING), false);
});
