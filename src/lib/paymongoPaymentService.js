import { adminSupabase } from "@/lib/supabase";
import { getCreditPlan } from "@/lib/paymentPlans";
import { claimEliteAutoresizerPromo } from "@/lib/eliteAutoresizerPromo";
import { sendPaymentReceipt } from "@/lib/transactionalEmail";

export function resolveLocalPaymongoPaymentQuery(resource) {
  const metadataId =
    resource?.attributes?.metadata?.local_payment_id ||
    resource?.metadata?.local_payment_id;
  if (metadataId) return { column: "id", value: metadataId };

  const sessionId = resource?.id?.startsWith("cs_") ? resource.id : null;
  if (sessionId) {
    return { column: "paymongo_checkout_session_id", value: sessionId };
  }

  const paymentId = resource?.id?.startsWith("pay_") ? resource.id : null;
  if (paymentId) {
    return { column: "paymongo_payment_id", value: paymentId };
  }

  return null;
}

export async function markPaymongoPaymentStatus(resource, status) {
  const query = resolveLocalPaymongoPaymentQuery(resource);
  if (!query) {
    console.warn(`[PayMongo] Cannot mark ${status}: missing local payment reference`);
    return false;
  }

  const paymentId =
    resource?.attributes?.payments?.[0]?.id ||
    (resource?.id?.startsWith("pay_") ? resource.id : undefined);

  const rawAmount =
    resource?.attributes?.payments?.[0]?.attributes?.amount ??
    resource?.attributes?.amount;
  const currency =
    resource?.attributes?.payments?.[0]?.attributes?.currency ??
    resource?.attributes?.currency;

  const update = {
    status,
    paymongo_payment_id: paymentId,
    amount: Number.isFinite(rawAmount) ? rawAmount : undefined,
    currency: currency || undefined,
  };

  const { error } = await adminSupabase
    .from("paymongo_payments")
    .update(update)
    .eq(query.column, query.value)
    .neq("status", "paid");

  if (error) throw error;
  return true;
}

export async function handlePaymongoPaymentSucceeded(eventData) {
  const resource = eventData?.attributes?.data || eventData;
  const query = resolveLocalPaymongoPaymentQuery(resource);
  if (!query) {
    throw new Error("Missing local payment reference in PayMongo webhook metadata");
  }

  const { data: localPayment, error: fetchError } = await adminSupabase
    .from("paymongo_payments")
    .select("*")
    .eq(query.column, query.value)
    .single();

  if (fetchError || !localPayment) {
    throw new Error("Local PayMongo payment record not found");
  }

  const plan = getCreditPlan(localPayment.plan);
  if (!plan || !Number.isInteger(localPayment.credits) || localPayment.credits <= 0) {
    throw new Error("Local PayMongo payment plan is invalid");
  }

  const paymentItem = resource?.attributes?.payments?.[0];
  const providerPaymentId =
    paymentItem?.id ||
    (resource?.id?.startsWith("pay_") ? resource.id : null) ||
    localPayment.paymongo_payment_id ||
    null;

  const providerCheckoutSessionId =
    (resource?.id?.startsWith("cs_") ? resource.id : null) ||
    localPayment.paymongo_checkout_session_id ||
    null;

  const paidAmount =
    paymentItem?.attributes?.amount ??
    resource?.attributes?.amount ??
    localPayment.amount;

  const paidCurrency =
    paymentItem?.attributes?.currency ??
    resource?.attributes?.currency ??
    localPayment.currency ??
    "PHP";

  // Atomically grant credits via Postgres function
  const { data: grantRows, error: grantError } = await adminSupabase.rpc(
    "grant_paymongo_payment_credits",
    {
      payment_row_id: localPayment.id,
      provider_payment_id: providerPaymentId,
      provider_checkout_session_id: providerCheckoutSessionId,
      paid_amount: paidAmount,
      paid_currency: paidCurrency,
    },
  );

  if (grantError) {
    throw new Error(`Failed to add credits: ${grantError.message}`);
  }

  const grant = Array.isArray(grantRows) ? grantRows[0] : grantRows;
  if (!grant?.granted) {
    return { alreadyProcessed: true };
  }

  // Insert credit log
  const { error: logError } = await adminSupabase.from("credit_logs").insert({
    user_id: grant.granted_user_id,
    action: "Top-Up via QR Ph (PayMongo)",
    amount: grant.granted_credits,
  });

  if (logError) {
    console.error("[PayMongo] Credit log insert failed:", logError);
  }

  // Elite promo check if user bought Elite plan
  const elitePromo =
    localPayment.plan === "elite" && localPayment.credits === plan.credits
      ? await claimEliteAutoresizerPromo({
          userId: grant.granted_user_id,
          email: localPayment.email,
          planKey: localPayment.plan,
          paymentSource: "paymongo",
          paymentId: localPayment.id,
        })
      : { eligible: false };

  // Send transactional email receipt
  await sendPaymentReceipt({
    to: localPayment.email,
    provider: "PayMongo QR Ph",
    plan: plan.label || localPayment.plan,
    credits: grant.granted_credits,
    amount: new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: paidCurrency || "PHP",
    }).format((paidAmount ?? localPayment.amount) / 100),
    reference: providerPaymentId || providerCheckoutSessionId || localPayment.id,
    paymentRecordId: localPayment.id,
  });

  return { credited: true, credits: grant.granted_credits, elitePromo };
}
