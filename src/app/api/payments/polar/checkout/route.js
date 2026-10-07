import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { getCreditPlan, getPolarProductId } from "@/lib/paymentPlans";
import { getCustomerIpAddress, getPolarClient, getSiteUrl } from "@/lib/polar";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request) {
  let localPayment = null;
  let checkoutCreated = false;

  try {
    if (!adminSupabase) {
      return NextResponse.json({ error: "Payment service is not configured" }, { status: 503 });
    }

    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace(/^Bearer\s+/i, "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rateLimit = await enforceRateLimit({
      namespace: "polar-checkout",
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
    if (!plan?.polarEnabled) {
      return NextResponse.json({ error: "This package is not available for card payment." }, { status: 400 });
    }

    const productId = getPolarProductId(plan);
    if (!productId) {
      return NextResponse.json({ error: `${plan.polarProductEnv} is not configured` }, { status: 500 });
    }

    const { data: insertedPayment, error: insertError } = await adminSupabase
      .from("polar_payments")
      .insert({
        user_id: user.id,
        email: user.email,
        plan: plan.key,
        credits: plan.credits,
        amount: plan.polarAmount,
        currency: plan.polarCurrency,
        polar_product_id: productId,
        status: "pending",
      })
      .select("*")
      .single();

    if (insertError || !insertedPayment) {
      console.error("[Polar Checkout] Failed to create local payment:", insertError);
      return NextResponse.json({ error: "Failed to prepare checkout" }, { status: 500 });
    }
    localPayment = insertedPayment;

    const siteUrl = getSiteUrl(request);
    const checkout = await getPolarClient().checkouts.create({
      products: [productId],
      externalCustomerId: user.id,
      customerEmail: user.email,
      customerName: user.user_metadata?.full_name || user.email?.split("@")[0] || undefined,
      customerIpAddress: getCustomerIpAddress(request),
      metadata: {
        local_payment_id: localPayment.id,
        user_id: user.id,
        plan: plan.key,
        credits: plan.credits,
      },
      successUrl: `${siteUrl}/?topup=polar-return&checkout_id={CHECKOUT_ID}`,
      returnUrl: `${siteUrl}/?topup=polar-cancelled`,
    });
    checkoutCreated = Boolean(checkout?.id);

    if (!checkout?.url) throw new Error("Polar checkout did not return a checkout URL");

    const { error: updateError } = await adminSupabase
      .from("polar_payments")
      .update({ polar_checkout_id: checkout.id })
      .eq("id", localPayment.id)
      .eq("user_id", user.id);
    if (updateError) console.error("[Polar Checkout] Failed to save checkout ID:", updateError);

    return NextResponse.json({ checkoutUrl: checkout.url, localPaymentId: localPayment.id });
  } catch (error) {
    if (localPayment && !checkoutCreated) {
      const { error: cleanupError } = await adminSupabase
        .from("polar_payments")
        .update({ status: "failed" })
        .eq("id", localPayment.id)
        .eq("status", "pending");
      if (cleanupError) console.error("[Polar Checkout] Cleanup failed:", cleanupError);
    }

    console.error("[Polar Checkout] Error:", error);
    return NextResponse.json({ error: error?.message || "Failed to create Polar checkout" }, { status: 500 });
  }
}
