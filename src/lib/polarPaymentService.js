import "server-only";

import { adminSupabase } from "@/lib/supabase";
import { getCreditPlan, getPolarProductId } from "@/lib/paymentPlans";
import { claimEliteDesaynscalePromo } from "@/lib/eliteDesaynscalePromo";
import { sendPaymentReceipt } from "@/lib/transactionalEmail";

export async function markPolarPaymentStatus(order, status) {
  const localPaymentId = order?.metadata?.local_payment_id;
  const checkoutId = order?.checkoutId || order?.checkout_id;
  if (!localPaymentId && !checkoutId) return false;

  let query = adminSupabase.from("polar_payments").update({
    status,
    polar_order_id: order?.id || undefined,
  });
  query = localPaymentId
    ? query.eq("id", localPaymentId)
    : query.eq("polar_checkout_id", checkoutId);

  const { error } = await query.neq("status", "paid");
  if (error) throw error;
  return true;
}

export async function handlePolarOrderPaid(order) {
  const localPaymentId = order?.metadata?.local_payment_id;
  if (!localPaymentId) throw new Error("Missing local payment reference in Polar order metadata");

  const { data: localPayment, error: fetchError } = await adminSupabase
    .from("polar_payments")
    .select("*")
    .eq("id", localPaymentId)
    .single();

  if (fetchError || !localPayment) throw new Error("Local Polar payment record not found");

  const plan = getCreditPlan(localPayment.plan);
  const expectedProductId = getPolarProductId(plan);
  const orderProductId = order.productId || order.product_id;
  const externalCustomerId = order.customer?.externalId || order.customer?.external_id;

  if (!plan || !expectedProductId || orderProductId !== expectedProductId) {
    throw new Error("Polar order product does not match the local payment plan");
  }
  if (externalCustomerId && externalCustomerId !== localPayment.user_id) {
    throw new Error("Polar order customer does not match the local payment user");
  }

  const checkoutId = order.checkoutId || order.checkout_id || localPayment.polar_checkout_id;
  const totalAmount = Number.isInteger(order.totalAmount)
    ? order.totalAmount
    : Number.isInteger(order.total_amount) ? order.total_amount : localPayment.amount;
  const currency = String(order.currency || localPayment.currency || "USD").toUpperCase();

  const { data: grantRows, error: grantError } = await adminSupabase.rpc(
    "grant_polar_payment_credits",
    {
      payment_row_id: localPayment.id,
      provider_order_id: order.id,
      provider_checkout_id: checkoutId,
      paid_amount: totalAmount,
      paid_currency: currency,
    },
  );

  if (grantError) throw new Error(`Failed to add credits: ${grantError.message}`);

  const grant = Array.isArray(grantRows) ? grantRows[0] : grantRows;
  if (!grant?.granted) return { alreadyProcessed: true };

  const { error: logError } = await adminSupabase.from("credit_logs").insert({
    user_id: grant.granted_user_id,
    action: "Top-Up via Polar",
    amount: grant.granted_credits,
  });
  if (logError) console.error("[Polar] Credit log insert failed:", logError);

  const elitePromo = localPayment.plan === "elite" && localPayment.credits === plan.credits
    ? await claimEliteDesaynscalePromo({
        userId: grant.granted_user_id,
        email: localPayment.email,
        planKey: localPayment.plan,
        paymentSource: "polar",
        paymentId: localPayment.id,
      })
    : { eligible: false };

  await sendPaymentReceipt({
    to: localPayment.email,
    provider: "Polar",
    plan: plan.label || localPayment.plan,
    credits: grant.granted_credits,
    amount: new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(totalAmount / 100),
    reference: order.id,
    paymentRecordId: localPayment.id,
  });

  return { credited: true, credits: grant.granted_credits, elitePromo };
}
