import { NextResponse } from "next/server";
import { validateEvent, WebhookVerificationError } from "@polar-sh/sdk/webhooks";
import {
  Webhook,
  WebhookVerificationError as StandardWebhookVerificationError,
} from "standardwebhooks";
import { handlePolarOrderPaid, markPolarPaymentStatus } from "@/lib/polarPaymentService";

export const runtime = "nodejs";

function verifyPolarEvent(rawBody, headers, secret) {
  try {
    // Polar endpoints reset after the Standard Webhooks migration use the
    // prefixed, base64-encoded secret directly.
    return new Webhook(secret).verify(rawBody, headers);
  } catch (error) {
    if (!(error instanceof StandardWebhookVerificationError)) {
      throw error;
    }

    // Keep accepting events signed with Polar's legacy literal-secret scheme.
    return validateEvent(rawBody, headers, secret);
  }
}

export async function POST(request) {
  try {
    const webhookSecret = process.env.POLAR_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 500 });
    }

    const rawBody = await request.text();
    const event = verifyPolarEvent(rawBody, {
      "webhook-id": request.headers.get("webhook-id") || "",
      "webhook-signature": request.headers.get("webhook-signature") || "",
      "webhook-timestamp": request.headers.get("webhook-timestamp") || "",
    }, webhookSecret);

    if (event.type === "order.paid" || (event.type === "order.updated" && event.data.paid)) {
      await handlePolarOrderPaid(event.data);
    } else if (event.type === "order.created" || event.type === "order.updated") {
      await markPolarPaymentStatus(event.data, "pending");
    } else if (event.type === "checkout.expired") {
      await markPolarPaymentStatus({ ...event.data, id: undefined, checkoutId: event.data.id }, "expired");
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    if (
      error instanceof WebhookVerificationError ||
      error instanceof StandardWebhookVerificationError
    ) {
      return NextResponse.json({ error: "Invalid webhook signature" }, { status: 403 });
    }
    console.error("[Polar Webhook] Processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
