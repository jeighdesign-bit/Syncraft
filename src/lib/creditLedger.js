import { adminSupabase } from "@/lib/supabase";

function firstRpcRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

export async function chargeCreditsVerified({
  userId,
  projectId,
  feature,
  action,
  amount,
  idempotencyKey = null,
  metadata = {},
}) {
  const { data, error } = await adminSupabase.rpc("charge_credits_verified", {
    p_user_id: userId,
    p_project_id: projectId,
    p_feature: feature,
    p_action: action,
    p_amount: amount,
    p_idempotency_key: idempotencyKey,
    p_metadata: metadata,
  });
  if (error) throw new Error(`Verified credit charge failed: ${error.message}`);

  const result = firstRpcRow(data);
  if (!result?.applied) {
    const reason = result?.failure_reason || "BILLING_ERROR";
    const error = new Error(reason);
    error.code = reason;
    error.balance = result?.balance_before ?? null;
    throw error;
  }
  return {
    transactionId: result.transaction_id,
    balanceBefore: Number(result.balance_before),
    balanceAfter: Number(result.balance_after),
    isOwnerTest: result.is_owner_test === true,
    replayed: result.replayed === true,
  };
}

export async function refundCreditVerified({
  chargeTransactionId,
  reason,
  action = "Refund (Error)",
  metadata = {},
}) {
  if (!chargeTransactionId) return { refunded: false, reason: "MISSING_CHARGE_TRANSACTION" };
  const { data, error } = await adminSupabase.rpc("refund_credit_verified", {
    p_charge_transaction_id: chargeTransactionId,
    p_reason: String(reason || "Generation failed").slice(0, 500),
    p_action: action,
    p_metadata: metadata,
  });
  if (error) throw new Error(`Verified credit refund failed: ${error.message}`);

  const result = firstRpcRow(data);
  return {
    refunded: result?.applied === true || result?.already_refunded === true,
    newlyRefunded: result?.applied === true,
    alreadyRefunded: result?.already_refunded === true,
    refundTransactionId: result?.refund_transaction_id || null,
    balanceBefore: result?.balance_before == null ? null : Number(result.balance_before),
    balanceAfter: result?.balance_after == null ? null : Number(result.balance_after),
    reason: result?.failure_reason || null,
  };
}

export async function markCreditTransaction({ transactionId, status, metadata = {} }) {
  if (!transactionId) return false;
  const { data, error } = await adminSupabase.rpc("mark_credit_transaction_status", {
    p_transaction_id: transactionId,
    p_status: status,
    p_metadata: metadata,
  });
  if (error) {
    console.error(`[Credit Ledger] Could not mark ${transactionId} as ${status}:`, error.message);
    return false;
  }
  return data === true;
}

export async function findLatestProjectCharge(projectId) {
  if (!projectId) return null;
  const { data, error } = await adminSupabase
    .from("credit_logs")
    .select("id,is_owner_test,feature,transaction_status")
    .eq("project_id", projectId)
    .eq("transaction_type", "charge")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`[Credit Ledger] Could not find charge for project ${projectId}:`, error.message);
    return null;
  }
  return data ? {
    transactionId: data.id,
    isOwnerTest: data.is_owner_test === true,
    feature: data.feature,
    status: data.transaction_status,
  } : null;
}

export async function recordProviderUsage({
  creditTransactionId = null,
  projectId,
  userId,
  provider,
  endpoint,
  providerRequestId = null,
  requestStatus = "succeeded",
  estimatedCostUsd = null,
  isOwnerTest = false,
  metadata = {},
}) {
  const row = {
    credit_transaction_id: creditTransactionId,
    project_id: projectId,
    user_id: userId,
    provider,
    endpoint,
    provider_request_id: providerRequestId || null,
    request_status: requestStatus,
    estimated_cost_usd: estimatedCostUsd,
    is_owner_test: isOwnerTest,
    metadata,
  };
  const { error } = await adminSupabase.from("provider_usage_logs").insert(row);
  if (error) {
    if (error.code === "23505") return true;
    console.error(`[Provider Ledger] Could not record ${provider}/${endpoint}:`, error.message);
    return false;
  }
  return true;
}
