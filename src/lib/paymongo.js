import crypto from "crypto";
import { getSiteUrl } from "./dodo.js";

const PAYMONGO_API_BASE = "https://api.paymongo.com/v1";

export function getPaymongoSecretKey() {
  const secretKey = process.env.PAYMONGO_SECRET_KEY;
  if (!secretKey) {
    throw new Error("PAYMONGO_SECRET_KEY is not configured");
  }
  return secretKey.trim();
}

export function getPaymongoAuthHeaders() {
  const secretKey = getPaymongoSecretKey();
  const encoded = Buffer.from(`${secretKey}:`).toString("base64");
  return {
    Authorization: `Basic ${encoded}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

/**
 * Creates a PayMongo Checkout Session for QR Ph payment.
 */
export async function createPaymongoCheckoutSession({
  user,
  plan,
  localPaymentId,
  siteUrl,
}) {
  const headers = getPaymongoAuthHeaders();
  const resolvedSiteUrl = siteUrl || "https://syncraftech.com";

  const customerName =
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "Syncraft User";

  const payload = {
    data: {
      attributes: {
        billing: {
          name: customerName,
          email: user.email,
        },
        send_email_receipt: true,
        show_description: true,
        show_line_items: true,
        description: `Syncraft Credits - ${plan.label} (${plan.credits} Credits)`,
        line_items: [
          {
            amount: plan.amount, // in PHP centavos (e.g. 49900 = ₱499.00)
            currency: "PHP",
            name: `Syncraft Credits - ${plan.label}`,
            quantity: 1,
            description: `${plan.credits} Credits for AI Generations & Tracing`,
          },
        ],
        payment_method_types: ["qrph"],
        metadata: {
          local_payment_id: localPaymentId,
          user_id: user.id,
          plan: plan.key,
          credits: String(plan.credits),
        },
        success_url: `${resolvedSiteUrl}/?topup=paymongo-return`,
        cancel_url: `${resolvedSiteUrl}/?topup=paymongo-cancelled`,
      },
    },
  };

  const response = await fetch(`${PAYMONGO_API_BASE}/checkout_sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg =
      data?.errors?.[0]?.detail ||
      data?.errors?.[0]?.code ||
      "Failed to create PayMongo Checkout Session";
    throw new Error(errorMsg);
  }

  const session = data?.data;
  return {
    sessionId: session?.id,
    checkoutUrl: session?.attributes?.checkout_url,
    session,
  };
}

/**
 * Creates a direct QR Ph Payment Intent and returns the Base64 QR image.
 */
export async function createPaymongoQrPhDirectIntent({
  user,
  plan,
  localPaymentId,
}) {
  const headers = getPaymongoAuthHeaders();

  // 1. Create Payment Intent
  const intentPayload = {
    data: {
      attributes: {
        amount: plan.amount,
        payment_method_allowed: ["qrph"],
        currency: "PHP",
        capture_type: "automatic",
        description: `Syncraft Credits - ${plan.label}`,
        metadata: {
          local_payment_id: localPaymentId,
          user_id: user.id,
          plan: plan.key,
          credits: String(plan.credits),
        },
      },
    },
  };

  const intentRes = await fetch(`${PAYMONGO_API_BASE}/payment_intents`, {
    method: "POST",
    headers,
    body: JSON.stringify(intentPayload),
  });
  const intentData = await intentRes.json();
  if (!intentRes.ok) throw new Error(intentData?.errors?.[0]?.detail || "Failed to create Payment Intent");
  const intent = intentData.data;

  // 2. Create QR Ph Payment Method
  const methodPayload = {
    data: {
      attributes: {
        type: "qrph",
        billing: {
          name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Syncraft User",
          email: user.email,
        }
      },
    },
  };

  const methodRes = await fetch(`${PAYMONGO_API_BASE}/payment_methods`, {
    method: "POST",
    headers,
    body: JSON.stringify(methodPayload),
  });
  const methodData = await methodRes.json();
  if (!methodRes.ok) throw new Error(methodData?.errors?.[0]?.detail || "Failed to create Payment Method");
  const method = methodData.data;

  // 3. Attach Payment Method to Payment Intent
  const attachPayload = {
    data: {
      attributes: {
        payment_method: method.id,
        client_key: intent.attributes.client_key,
        return_url: "https://syncraftech.com"
      },
    },
  };

  const attachRes = await fetch(`${PAYMONGO_API_BASE}/payment_intents/${intent.id}/attach`, {
    method: "POST",
    headers,
    body: JSON.stringify(attachPayload),
  });
  const attachData = await attachRes.json();
  if (!attachRes.ok) throw new Error(attachData?.errors?.[0]?.detail || "Failed to attach Payment Method");

  const nextAction = attachData.data?.attributes?.next_action;
  
  return {
    intentId: intent.id,
    qrBase64: nextAction?.code?.image_url,
    expiresAt: nextAction?.code?.expires_at,
    status: attachData.data?.attributes?.status
  };
}

/**
 * Verifies PayMongo Webhook signature with timing-safe comparison.
 * PayMongo sends header format: t=1614234567,te=<test_sig>,li=<live_sig>
 */
export function verifyPaymongoSignature(rawBody, signatureHeader, webhookSecret) {
  if (!rawBody || !signatureHeader || !webhookSecret) {
    return false;
  }

  try {
    const parts = signatureHeader.split(",").reduce((acc, part) => {
      const [key, val] = part.trim().split("=");
      if (key && val) acc[key] = val;
      return acc;
    }, {});

    const timestamp = parts.t;
    const testSig = parts.te;
    const liveSig = parts.li;

    // If signature header is in standard format t=..., te/li=...
    if (timestamp && (testSig || liveSig)) {
      const payloadToSign = `${timestamp}.${rawBody}`;
      const expectedSig = crypto
        .createHmac("sha256", webhookSecret)
        .update(payloadToSign)
        .digest("hex");

      const matchTest =
        testSig &&
        testSig.length === expectedSig.length &&
        crypto.timingSafeEqual(Buffer.from(testSig), Buffer.from(expectedSig));

      const matchLive =
        liveSig &&
        liveSig.length === expectedSig.length &&
        crypto.timingSafeEqual(Buffer.from(liveSig), Buffer.from(expectedSig));

      return Boolean(matchTest || matchLive);
    }

    // Direct hex signature fallback
    const directExpectedSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const cleanHeader = signatureHeader.trim();
    if (cleanHeader.length === directExpectedSig.length) {
      return crypto.timingSafeEqual(
        Buffer.from(cleanHeader),
        Buffer.from(directExpectedSig),
      );
    }

    return false;
  } catch (err) {
    console.error("[PayMongo] Error verifying signature:", err);
    return false;
  }
}
