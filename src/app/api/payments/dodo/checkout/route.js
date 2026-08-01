import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { getCreditPlan, getDodoProductId } from "@/lib/paymentPlans";
import { getDodoClient, getSiteUrl } from "@/lib/dodo";
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
    const { data: { user }, error: authErr } = await adminSupabase.auth.getUser(token);
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = await enforceRateLimit({
      namespace: "dodo-checkout",
      identifier: user.id,
      max: 10,
      window: "10 m",
      windowMs: 10 * 60_000,
    });
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many checkout attempts. Please try again later." }, { status: 429 });
    }

    const { plan: planKey } = await request.json();
    const plan = getCreditPlan(planKey);
    if (!plan) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }
    if (!plan.dodoEnabled) {
      return NextResponse.json({ error: "This package is only available via GCash manual payment." }, { status: 400 });
    }

    const productId = getDodoProductId(plan);
    if (!productId) {
      return NextResponse.json({ error: `${plan.dodoProductEnv} is not configured` }, { status: 500 });
    }

    const { data: insertedPayment, error: insertErr } = await adminSupabase
      .from("dodo_payments")
      .insert({
        user_id: user.id,
        email: user.email,
        plan: plan.key,
        credits: plan.credits,
        amount: plan.dodoAmount || plan.amount,
        currency: plan.dodoCurrency || plan.currency,
        status: "pending",
      })
      .select("*")
      .single();

    if (insertErr || !insertedPayment) {
      console.error("[Dodo Checkout] Failed to create local payment:", insertErr);
      return NextResponse.json({ error: "Failed to prepare checkout" }, { status: 500 });
    }
    localPayment = insertedPayment;

    const siteUrl = getSiteUrl(request);
    console.log("[Dodo Checkout] siteUrl resolved:", siteUrl);
    const client = getDodoClient();
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: {
        email: user.email,
        name: user.user_metadata?.full_name || user.email?.split("@")[0] || "Syncraft User",
      },
      metadata: {
        local_payment_id: localPayment.id,
        user_id: user.id,
        plan: plan.key,
        credits: String(plan.credits),
      },
      return_url: `${siteUrl}/?topup=dodo-return`,
      cancel_url: `${siteUrl}/?topup=dodo-cancelled`,
    });
    checkoutSessionCreated = Boolean(session?.session_id);

    const checkoutUrl = session.checkout_url;
    if (!checkoutUrl) {
      await adminSupabase
        .from("dodo_payments")
        .update({ status: "failed" })
        .eq("id", localPayment.id)
        .eq("user_id", user.id);
      return NextResponse.json({ error: "Dodo checkout did not return a checkout URL" }, { status: 502 });
    }

    const { error: sessionUpdateError } = await adminSupabase
      .from("dodo_payments")
      .update({ dodo_checkout_session_id: session.session_id })
      .eq("id", localPayment.id)
      .eq("user_id", user.id);

    if (sessionUpdateError) {
      // The checkout metadata contains local_payment_id, so the webhook can
      // still reconcile this payment even if this non-critical update fails.
      console.error("[Dodo Checkout] Failed to save checkout session ID:", sessionUpdateError);
    }

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    // The local row is inserted before Dodo is called. Without this cleanup,
    // a Dodo/API/network failure leaves an orphan row stuck at PENDING forever.
    if (localPayment && !checkoutSessionCreated) {
      const { error: cleanupError } = await adminSupabase
        .from("dodo_payments")
        .update({ status: "failed" })
        .eq("id", localPayment.id)
        .eq("status", "pending");

      if (cleanupError) {
        console.error("[Dodo Checkout] Failed to mark checkout as failed:", cleanupError);
      }
    }

    console.error("[Dodo Checkout] Error:", error?.message, error?.status, JSON.stringify(error?.error || {}));
    return NextResponse.json({ error: error.message || "Failed to create Dodo checkout" }, { status: 500 });
  }
}
