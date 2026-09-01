import { Resend } from "resend";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  createDesaynscaleDeliveryEmail,
  createPaymentReceiptEmail,
  EMAIL_LOGO_CONTENT_ID,
} from "@/lib/emailTemplates.mjs";

const DEFAULT_FROM = "Syncraft Team <payments@syncraftech.com>";
const DEFAULT_REPLY_TO = "syncraft.team@gmail.com";
const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://syncraftech.com"
).replace(/\/$/, "");

async function getEmailLogoAttachment() {
  const content = await readFile(
    path.join(process.cwd(), "public", "email-logo.png"),
    "base64",
  );

  return {
    filename: "syncraft-logo.png",
    content,
    contentType: "image/png",
    contentId: EMAIL_LOGO_CONTENT_ID,
  };
}

function getResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  return apiKey ? new Resend(apiKey) : null;
}

export function getTransactionalEmailConfig() {
  return {
    configured: Boolean(process.env.RESEND_API_KEY),
    from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
    replyTo: process.env.RESEND_REPLY_TO || DEFAULT_REPLY_TO,
  };
}

export async function sendPaymentReceipt({
  to,
  provider,
  plan,
  credits,
  amount,
  reference,
  paymentRecordId,
}) {
  const resend = getResendClient();
  if (!resend) {
    console.warn("[Email] Payment receipt skipped: RESEND_API_KEY is not configured");
    return { sent: false, skipped: true, reason: "not_configured" };
  }

  if (!to || !paymentRecordId) {
    console.warn("[Email] Payment receipt skipped: recipient or payment record is missing");
    return { sent: false, skipped: true, reason: "missing_recipient_or_record" };
  }

  const config = getTransactionalEmailConfig();
  const email = createPaymentReceiptEmail({
    provider,
    plan,
    credits,
    amount,
    reference,
    siteUrl: SITE_URL,
  });
  const providerKey = String(provider || "payment").toLowerCase().replace(/[^a-z0-9]+/g, "-");

  try {
    const logoAttachment = await getEmailLogoAttachment();
    const { data, error } = await resend.emails.send(
      {
        from: config.from,
        to,
        replyTo: config.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: [logoAttachment],
      },
      {
        idempotencyKey: `payment-confirmed/${providerKey}/${paymentRecordId}`,
      },
    );

    if (error) {
      console.error("[Email] Resend rejected payment receipt:", error);
      return { sent: false, error };
    }

    return { sent: true, id: data?.id || null };
  } catch (error) {
    console.error("[Email] Payment receipt request failed:", error);
    return { sent: false, error };
  }
}

export async function sendDesaynscaleDeliveryEmail({
  to,
  claimNumber,
  paymentSource,
  paymentRecordId,
}) {
  const resend = getResendClient();
  const downloadUrl = process.env.DESAYNSCALE_DOWNLOAD_URL;

  if (!resend) {
    console.warn("[Email] DesaynScale delivery skipped: RESEND_API_KEY is not configured");
    return { sent: false, skipped: true, reason: "not_configured" };
  }

  if (!downloadUrl) {
    console.warn("[Email] DesaynScale delivery skipped: DESAYNSCALE_DOWNLOAD_URL is not configured");
    return { sent: false, skipped: true, reason: "missing_download_url" };
  }

  if (!to || !paymentRecordId) {
    console.warn("[Email] DesaynScale delivery skipped: recipient or payment record is missing");
    return { sent: false, skipped: true, reason: "missing_recipient_or_record" };
  }

  const config = getTransactionalEmailConfig();
  const email = createDesaynscaleDeliveryEmail({ downloadUrl, claimNumber });
  const providerKey = String(paymentSource || "payment")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-");

  try {
    const logoAttachment = await getEmailLogoAttachment();
    const { data, error } = await resend.emails.send(
      {
        from: config.from,
        to,
        replyTo: config.replyTo,
        subject: email.subject,
        html: email.html,
        text: email.text,
        attachments: [logoAttachment],
      },
      {
        idempotencyKey: `desaynscale-delivery/${providerKey}/${paymentRecordId}`,
      },
    );

    if (error) {
      console.error("[Email] Resend rejected DesaynScale delivery:", error);
      return { sent: false, error };
    }

    return { sent: true, id: data?.id || null };
  } catch (error) {
    console.error("[Email] DesaynScale delivery request failed:", error);
    return { sent: false, error };
  }
}
