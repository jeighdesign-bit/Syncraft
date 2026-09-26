import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { getB2bCreditPlan } from "@/lib/b2bPaymentPlans";
import { createPaymongoQrPhDirectIntent } from "@/lib/paymongo";
import { enforceRateLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

export async function POST(request) {
  let localPayment = null;
  let intentCreated = false;

  try {
    const authHeader = request.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const rateLimit = await enforceRateLimit({
      namespace: "b2b-paymongo-checkout",
      identifier: user.id,
      max: 8,
      window: "10 m",
      windowMs: 10 * 60_000,
    });
    if (!rateLimit.success) {
      return NextResponse.json({ error: "Too many checkout attempts. Please try again later." }, { status: 429 });
    }

    const { planKey } = await request.json();
    const plan = getB2bCreditPlan(planKey);
    if (!plan) return NextResponse.json({ error: "Invalid API credit package" }, { status: 400 });

    const { data: company, error: companyError } = await adminSupabase
      .from("b2b_companies")
      .select("id, name, contact_email, is_active")
      .eq("user_id", user.id)
      .single();
    if (companyError || !company?.is_active) {
      return NextResponse.json({ error: "Active API company account not found" }, { status: 404 });
    }

    const { data: insertedPayment, error: insertError } = await adminSupabase
      .from("b2b_paymongo_payments")
      .insert({
        company_id: company.id,
        user_id: user.id,
        email: company.contact_email || user.email,
        plan: plan.key,
        credits: plan.credits,
        amount: plan.amount,
        currency: "PHP",
        status: "pending",
      })
      .select("*")
      .single();
    if (insertError || !insertedPayment) throw insertError || new Error("Failed to prepare checkout");
    localPayment = insertedPayment;

    const { intentId, qrBase64, expiresAt } = await createPaymongoQrPhDirectIntent({
      user,
      plan,
      localPaymentId: localPayment.id,
      metadata: { payment_scope: "b2b_api", company_id: company.id },
    });
    intentCreated = Boolean(intentId);
    if (!qrBase64) throw new Error("PayMongo did not return a QR code");

    const { error: updateError } = await adminSupabase
      .from("b2b_paymongo_payments")
      .update({ paymongo_intent_id: intentId })
      .eq("id", localPayment.id);
    if (updateError) throw updateError;

    return NextResponse.json({
      paymentId: localPayment.id,
      qrBase64,
      expiresAt,
      plan: { key: plan.key, label: plan.label, credits: plan.credits, amount: plan.amount },
    });
  } catch (error) {
    if (localPayment && !intentCreated) {
      await adminSupabase
        .from("b2b_paymongo_payments")
        .update({ status: "failed" })
        .eq("id", localPayment.id)
        .eq("status", "pending");
    }
    console.error("[B2B PayMongo Checkout]", error);
    return NextResponse.json({ error: error?.message || "Failed to create API credit checkout" }, { status: 500 });
  }
}

