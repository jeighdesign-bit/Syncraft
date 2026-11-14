// PayMongo currently sends an ISO timestamp. Also accept Unix timestamps so
// a provider format change cannot accidentally extend a QR's lifetime.
export function qrExpiryTimestamp(expiresAt) {
  if (expiresAt == null || expiresAt === "") return null;
  const numeric = typeof expiresAt === "number" || /^\d+(\.\d+)?$/.test(expiresAt);
  const value = numeric
    ? Number(expiresAt) * (Number(expiresAt) < 1e12 ? 1000 : 1)
    : Date.parse(expiresAt);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function qrExpiryState(expiresAt, now = Date.now()) {
  const deadline = qrExpiryTimestamp(expiresAt);
  // Never display a payable QR with an unknown expiry.
  const remainingSeconds = deadline == null ? 0 : Math.max(0, Math.ceil((deadline - now) / 1000));
  return {
    expired: remainingSeconds === 0,
    remainingSeconds,
    label: `${String(Math.floor(remainingSeconds / 60)).padStart(2, "0")}:${String(remainingSeconds % 60).padStart(2, "0")}`,
  };
}
