export const PAYMENT_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  ALREADY_PAID: "already_paid",
});

export const MANUAL_PAYMENT_HISTORY_STATUSES = Object.freeze([
  PAYMENT_STATUS.APPROVED,
  PAYMENT_STATUS.ALREADY_PAID,
]);

export function getApprovalStatus(markOnly) {
  return markOnly === true
    ? PAYMENT_STATUS.ALREADY_PAID
    : PAYMENT_STATUS.APPROVED;
}

export function countsAsManualRevenue(status) {
  return status === PAYMENT_STATUS.APPROVED;
}

export function addsCreditsForStatus(status) {
  return status === PAYMENT_STATUS.APPROVED;
}

export function appearsInManualPaymentHistory(status) {
  return MANUAL_PAYMENT_HISTORY_STATUSES.includes(status);
}
