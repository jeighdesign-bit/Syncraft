import "server-only";

import { adminSupabase } from "@/lib/supabase";
import { getB2bCreditPlan } from "@/lib/b2bPaymentPlans";
import { sendPaymentReceipt } from "@/lib/transactionalEmail";

function getResource(resource) {
  return resource?.attributes?.data || resource;
}

export function isB2bPaymongoResource(resource) {
  const resolved = getResource(resource);
  const payment = resolved?.attributes?.payments?.[0];
  const metadata = payment?.attributes?.metadata || resolved?.attributes?.metadata || resolved?.metadata;
  return metadata?.payment_scope === "b2b_api";
}

function resolvePaymentReference(resource) {
  const resolved = getResource(resource);
  const payment = resolved?.attributes?.payments?.[0];
  const metadata = payment?.attributes?.metadata || resolved?.attributes?.metadata || resolved?.metadata;
  const localPaymentId = metadata?.local_payment_id;
  if (localPaymentId) return { column: "id", value: localPaymentId };

  const id = resolved?.id;
  if (id?.startsWith("pi_") || id?.startsWith("cs_")) {
    return { column: "paymongo_intent_id", value: id };
  }
  if (id?.startsWith("pay_")) return { column: "paymongo_payment_id", value: id };
  return null;
}

export async function markB2bPaymongoPaymentStatus(resource, status) {
  const resolved = getResource(resource);
  const reference = resolvePaymentReference(resolved);
  if (!reference) return false;

  const payment = resolved?.attributes?.payments?.[0];
  const paymentId = payment?.id || (resolved?.id?.startsWith("pay_") ? resolved.id : undefined);
  const { error } = await adminSupabase
    .from("b2b_paymongo_payments")
    .update({ status, paymongo_payment_id: paymentId })
    .eq(reference.column, reference.value)
    .neq("status", "paid");

  if (error) throw error;
  return true;
}

export async function handleB2bPaymongoPaymentSucceeded(resource) {
  const resolved = getResource(resource);
  const reference = resolvePaymentReference(resolved);
  if (!reference) throw new Error("Missing B2B PayMongo payment reference");

  const { data: localPayment, error: fetchError } = await adminSupabase
    .from("b2b_paymongo_payments")
    .select("*")
    .eq(reference.column, reference.value)
    .single();

  if (fetchError || !localPayment) throw new Error("B2B PayMongo payment not found");

  const plan = getB2bCreditPlan(localPayment.plan);
  if (!plan || plan.credits !== localPayment.credits || plan.amount !== localPayment.amount) {
    throw new Error("B2B PayMongo plan does not match the expected package");
  }

  const payment = resolved?.attributes?.payments?.[0];
  const providerPaymentId =
    payment?.id ||
    (resolved?.id?.startsWith("pay_") ? resolved.id : null) ||
    localPayment.paymongo_payment_id;
  const providerIntentId =
    (resolved?.id?.startsWith("pi_") || resolved?.id?.startsWith("cs_") ? resolved.id : null) ||
    localPayment.paymongo_intent_id;
  const paidAmount = payment?.attributes?.amount ?? resolved?.attributes?.amount ?? localPayment.amount;
  const paidCurrency = String(
    payment?.attributes?.currency ?? resolved?.attributes?.currency ?? localPayment.currency,
  ).toUpperCase();

  if (paidAmount !== localPayment.amount || paidCurrency !== "PHP") {
    throw new Error("B2B PayMongo payment amount or currency does not match");
  }

  const { data: grantRows, error: grantError } = await adminSupabase.rpc(
    "grant_b2b_paymongo_credits",
    {
      payment_row_id: localPayment.id,
      provider_payment_id: providerPaymentId,
      provider_intent_id: providerIntentId,
      paid_amount: paidAmount,
      paid_currency: paidCurrency,
    },
  );

  if (grantError) throw new Error(`Failed to add API credits: ${grantError.message}`);
  const grant = Array.isArray(grantRows) ? grantRows[0] : grantRows;
  if (!grant?.granted) return { alreadyProcessed: true };

  await sendPaymentReceipt({
    to: localPayment.email,
    provider: "PayMongo QR Ph",
    plan: `${plan.label} API Credits`,
    credits: grant.granted_credits,
    amount: new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(
      paidAmount / 100,
    ),
    reference: providerPaymentId || providerIntentId || localPayment.id,
    paymentRecordId: localPayment.id,
  });

  return { credited: true, credits: grant.granted_credits, companyId: grant.granted_company_id };
}

