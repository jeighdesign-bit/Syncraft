const COLORS = Object.freeze({
  background: "#0b0d0c",
  card: "#171a18",
  panel: "#101210",
  border: "#303530",
  muted: "#a7ada8",
  accent: "#ccff3d",
});

export const EMAIL_LOGO_CONTENT_ID = "syncraft-logo";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function detailRow(label, value, { accent = false, last = false } = {}) {
  return `
    <tr>
      <td style="padding:12px 0;${last ? "" : `border-bottom:1px solid ${COLORS.border};`}color:${COLORS.muted};font-size:13px;line-height:1.45">${escapeHtml(label)}</td>
      <td style="padding:12px 0 12px 18px;${last ? "" : `border-bottom:1px solid ${COLORS.border};`}color:${accent ? COLORS.accent : "#ffffff"};font-size:14px;font-weight:700;line-height:1.45;text-align:right;word-break:break-word">${escapeHtml(value)}</td>
    </tr>
  `;
}

export function createPaymentReceiptEmail({
  provider,
  plan,
  credits,
  amount,
  reference,
  siteUrl,
}) {
  const displayProvider = String(provider || "Payment");
  const displayPlan = String(plan || "Not specified");
  const displayCredits = Number.isFinite(Number(credits)) ? Number(credits) : 0;
  const safeSiteUrl = escapeHtml(siteUrl);
  const dashboardUrl = `${safeSiteUrl}/dashboard`;
  const rows = [
    detailRow("Plan", displayPlan),
    amount ? detailRow("Amount", amount) : "",
    detailRow("Credits added", `+${displayCredits} credits`, { accent: true }),
    detailRow("Payment method", displayProvider),
    reference ? detailRow("Reference", reference, { last: true }) : "",
  ].join("");

  const html = `
    <!doctype html>
    <html lang="en">
      <body style="margin:0;background:${COLORS.background};color:#ffffff;font-family:Inter,Segoe UI,Arial,sans-serif;-webkit-font-smoothing:antialiased">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your payment is confirmed and ${displayCredits} Syncraft credits are ready to use.</div>
        <div style="padding:40px 16px">
          <div style="max-width:580px;margin:0 auto;background:${COLORS.card};border:1px solid ${COLORS.border};border-radius:18px;overflow:hidden;box-shadow:0 18px 55px rgba(0,0,0,.32)">
            <div style="height:4px;background:${COLORS.accent};font-size:0;line-height:0">&nbsp;</div>
            <div style="padding:32px 28px 14px;text-align:center">
              <img src="cid:${EMAIL_LOGO_CONTENT_ID}" alt="Syncraft" width="184" style="display:inline-block;width:184px;max-width:72%;height:auto;border:0;outline:none;text-decoration:none">
              <div style="margin:28px auto 16px;width:48px;height:48px;border-radius:50%;background:#26321b;color:${COLORS.accent};font-size:25px;font-weight:900;line-height:48px">&#10003;</div>
              <p style="margin:0 0 8px;color:${COLORS.accent};font-size:11px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase">Payment successful</p>
              <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;letter-spacing:-.5px">Your credits are ready</h1>
              <p style="max-width:440px;margin:0 auto;color:${COLORS.muted};font-size:15px;line-height:1.65">
                Your payment has been verified. We added <strong style="color:#ffffff">${displayCredits} credits</strong> to your Syncraft account.
              </p>
            </div>
            <div style="padding:18px 28px 32px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${COLORS.panel};border:1px solid ${COLORS.border};border-radius:12px;padding:8px 18px;border-collapse:separate">
                ${rows}
              </table>
              <div style="margin-top:24px;text-align:center">
                <a href="${dashboardUrl}" style="display:inline-block;background:${COLORS.accent};color:#090a09;text-decoration:none;padding:14px 26px;border-radius:9px;font-size:14px;font-weight:900;line-height:1">Open your dashboard&nbsp;&nbsp;&rarr;</a>
              </div>
              <p style="margin:26px 0 0;color:#777e78;font-size:12px;line-height:1.6;text-align:center">
                Need help? Reply to this email and include the payment reference above.<br>Sent securely by Syncraft Payments.
              </p>
            </div>
          </div>
        </div>
      </body>
    </html>
  `;

  const text = [
    "Syncraft payment confirmed",
    "",
    `Your payment was verified and ${displayCredits} credits are now available in your Syncraft account.`,
    `Plan: ${displayPlan}`,
    amount ? `Amount: ${amount}` : null,
    `Credits added: +${displayCredits} credits`,
    `Payment method: ${displayProvider}`,
    reference ? `Reference: ${reference}` : null,
    "",
    `Open your dashboard: ${siteUrl}/dashboard`,
    "Questions about this payment? Reply to this email.",
  ].filter(Boolean).join("\n");

  return {
    subject: `Payment confirmed — ${displayCredits} Syncraft credits added`,
    html,
    text,
  };
}
