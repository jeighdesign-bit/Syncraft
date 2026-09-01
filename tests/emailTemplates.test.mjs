import test from "node:test";
import assert from "node:assert/strict";
import {
  createDesaynscaleDeliveryEmail,
  createPaymentReceiptEmail,
  escapeHtml,
} from "../src/lib/emailTemplates.mjs";

test("email template escapes payment data before inserting it into HTML", () => {
  assert.equal(escapeHtml(`<script>alert("x")</script>`), "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");

  const email = createPaymentReceiptEmail({
    provider: "GCash",
    plan: `<img src=x onerror=alert(1)>`,
    credits: 60,
    amount: "₱149.00",
    reference: `ABC<123`,
    siteUrl: "https://syncraftech.com",
  });

  assert.doesNotMatch(email.html, /<img src=x onerror/);
  assert.match(email.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(email.html, /ABC&lt;123/);
});

test("payment receipt contains HTML and plain-text transaction details", () => {
  const email = createPaymentReceiptEmail({
    provider: "Dodo Payments",
    plan: "Pro",
    credits: 288,
    amount: "$9.99",
    reference: "pay_123",
    siteUrl: "https://syncraftech.com",
  });

  assert.match(email.subject, /288 Syncraft credits/);
  assert.match(email.html, /src="cid:syncraft-logo"/);
  assert.match(email.html, /alt="Syncraft"/);
  assert.match(email.html, /https:\/\/syncraftech\.com\/dashboard/);
  assert.doesNotMatch(email.html, /Dodo Payments payment/);
  assert.match(email.text, /Payment method: Dodo Payments/);
  assert.match(email.text, /Reference: pay_123/);
});

test("payment receipt uses safe fallbacks instead of blank details", () => {
  const email = createPaymentReceiptEmail({
    provider: "",
    plan: "",
    credits: undefined,
    siteUrl: "https://syncraftech.com",
  });

  assert.match(email.html, /Not specified/);
  assert.match(email.text, /Payment method: Payment/);
  assert.match(email.text, /Credits added: \+0 credits/);
});

test("DesaynScale delivery email includes lifetime access and an escaped download link", () => {
  const email = createDesaynscaleDeliveryEmail({
    downloadUrl: `https://drive.google.com/folder?id=1&next=<script>`,
    claimNumber: 2,
  });

  assert.match(email.subject, /FREE DesaynScale lifetime access/);
  assert.match(email.html, /Lifetime/);
  assert.match(email.html, /Elite launch bonus #2/);
  assert.match(email.html, /id=1&amp;next=&lt;script&gt;/);
  assert.doesNotMatch(email.html, /next=<script>/);
  assert.match(email.text, /Open the DesaynScale files: https:\/\/drive\.google\.com/);
});
