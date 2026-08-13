import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { getDodoClient } from "@/lib/dodo";
import {
  handleDodoPaymentSucceeded,
  markDodoPaymentStatus,
} from "@/lib/dodoPaymentService";

export const runtime = "nodejs";

function getWebhookHeaders(request) {
  return {
    "webhook-id": request.headers.get("webhook-id") || "",
    "webhook-signature": request.headers.get("webhook-signature") || "",
    "webhook-timestamp": request.headers.get("webhook-timestamp") || "",
  };
}

async function markAbandonedCheckout(data) {
  if (!data?.payment_id) return;

  const { error } = await adminSupabase
    .from("dodo_payments")
    .update({ status: "cancelled", dodo_payment_id: data.payment_id })
    .eq("dodo_payment_id", data.payment_id)
    .neq("status", "paid");

  if (error) throw error;
}

export async function POST(request) {
  try {
    const webhookSecret = process.env.DODO_PAYMENTS_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Webhook secret is not configured" }, { status: 500 });
    }

    const rawBody = await request.text();
    const client = getDodoClient();
    const event = client.webhooks.unwrap(rawBody, {
      headers: getWebhookHeaders(request),
      key: webhookSecret,
    });

    if (event.type === "payment.succeeded") {
      await handleDodoPaymentSucceeded(event.data);
    } else if (event.type === "payment.processing") {
      await markDodoPaymentStatus(event.data, "pending");
    } else if (event.type === "payment.failed" || event.type === "payment.cancelled") {
      await markDodoPaymentStatus(event.data, "failed");
    } else if (event.type === "abandoned_checkout.detected") {
      await markAbandonedCheckout(event.data);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[Dodo Webhook] Error:", error);
    return NextResponse.json({ error: "Invalid or failed webhook" }, { status: 400 });
  }
}
