import { NextResponse } from "next/server";
import { verifyPaymongoSignature } from "@/lib/paymongo";
import {
  handlePaymongoPaymentSucceeded,
  markPaymongoPaymentStatus,
} from "@/lib/paymongoPaymentService";
import {
  handleB2bPaymongoPaymentSucceeded,
  isB2bPaymongoResource,
  markB2bPaymongoPaymentStatus,
} from "@/lib/b2bPaymongoPaymentService";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
    const rawBody = await request.text();
    const signature =
      request.headers.get("paymongo-signature") ||
      request.headers.get("x-signature") ||
      "";

    // Signature verification (if webhook secret is configured)
    if (webhookSecret) {
      const isValid = verifyPaymongoSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        console.error("[PayMongo Webhook] Signature verification failed");
        return NextResponse.json(
          { error: "Invalid webhook signature" },
          { status: 401 },
        );
      }
    } else {
      console.warn(
        "[PayMongo Webhook] PAYMONGO_WEBHOOK_SECRET not configured. Proceeding without signature verification.",
      );
    }

    const payload = JSON.parse(rawBody);
    const event = payload?.data;
    const eventType = event?.attributes?.type;
    const eventData = event?.attributes?.data;

    console.log(`[PayMongo Webhook] Received event: ${eventType} (ID: ${event?.id})`);

    const isB2bPayment = isB2bPaymongoResource(eventData);

    if (
      eventType === "checkout_session.payment.paid" ||
      eventType === "payment.paid"
    ) {
      if (isB2bPayment) await handleB2bPaymongoPaymentSucceeded(eventData);
      else await handlePaymongoPaymentSucceeded(eventData);
    } else if (eventType === "payment.failed") {
      if (isB2bPayment) await markB2bPaymongoPaymentStatus(eventData, "failed");
      else await markPaymongoPaymentStatus(eventData, "failed");
    } else if (eventType === "qrph.expired") {
      if (isB2bPayment) await markB2bPaymongoPaymentStatus(eventData, "expired");
      else await markPaymongoPaymentStatus(eventData, "expired");
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[PayMongo Webhook] Processing error:", error);
    return NextResponse.json(
      { error: error?.message || "Internal webhook error" },
      { status: 400 },
    );
  }
}
