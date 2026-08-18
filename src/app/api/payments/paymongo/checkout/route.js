import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { getCreditPlan } from "@/lib/paymentPlans";
import { getSiteUrl } from "@/lib/dodo";
import { createPaymongoQrPhDirectIntent } from "@/lib/paymongo";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request) {
  let localPayment = null;
  let checkoutSessionCreated = false;

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const {
      data: { user },
      error: authErr,
    } = await adminSupabase.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await enforceRateLimit({
      namespace: "paymongo-checkout",
      identifier: user.id,
      max: 10,
      window: "10 m",
      windowMs: 10 * 60_000,
    });
    if (!rateLimit.success) {
      return NextResponse.json(
        { error: "Too many checkout attempts. Please try again later." },
        { status: 429 },
      );
    }

    const body = await request.json();
    const planKey = body.planKey || body.plan;
    const plan = getCreditPlan(planKey);
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    // Insert pending payment row in database
    const { data: insertedPayment, error: insertErr } = await adminSupabase
      .from("paymongo_payments")
      .insert({
        user_id: user.id,
        email: user.email,
        plan: plan.key,
        credits: plan.credits,
        amount: plan.amount, // in PHP centavos (e.g. 49900 for ₱499)
        currency: "PHP",
        status: "pending",
      })
      .select("*")
      .single();

    if (insertErr || !insertedPayment) {
      console.error("[PayMongo Checkout] Failed to create local payment:", insertErr);
      return NextResponse.json(
        { error: "Failed to prepare PayMongo checkout record." },
        { status: 500 },
      );
    }
    localPayment = insertedPayment;

    const { intentId, qrBase64, expiresAt } = await createPaymongoQrPhDirectIntent({
      user,
      plan,
      localPaymentId: localPayment.id,
    });

    checkoutSessionCreated = Boolean(intentId);

    if (!qrBase64) {
      await adminSupabase
        .from("paymongo_payments")
        .update({ status: "failed" })
        .eq("id", localPayment.id);
      return NextResponse.json(
        { error: "PayMongo did not return a QR code image" },
        { status: 502 },
      );
    }

    // Update local payment record with the PayMongo Intent ID
    await adminSupabase
      .from("paymongo_payments")
      .update({ paymongo_checkout_session_id: intentId })
      .eq("id", localPayment.id);

    return NextResponse.json({ 
      intentId, 
      qrBase64,
      expiresAt,
      localPaymentId: localPayment.id
    });
  } catch (error) {
    if (localPayment && !checkoutSessionCreated) {
      await adminSupabase
        .from("paymongo_payments")
        .update({ status: "failed" })
        .eq("id", localPayment.id)
        .eq("status", "pending");
    }

    console.error("[PayMongo Checkout] Error:", error?.message);
    return NextResponse.json(
      { error: error?.message || "Failed to create PayMongo checkout" },
      { status: 500 },
    );
  }
}
