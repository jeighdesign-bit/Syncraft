import "server-only";

import { adminSupabase } from "@/lib/supabase";

export const ELITE_AUTORESIZER_PROMO_LIMIT = 10;

export async function claimEliteAutoresizerPromo({
  userId,
  email,
  planKey,
  paymentSource,
  paymentId,
}) {
  if (planKey !== "elite") return { eligible: false };
  if (!adminSupabase || !userId || !paymentSource || !paymentId) {
    return { eligible: true, granted: false, error: "Promo claim is not configured." };
  }

  const { data, error } = await adminSupabase.rpc("claim_elite_autoresizer_promo", {
    claim_user_id: userId,
    claim_email: email || "",
    claim_payment_source: paymentSource,
    claim_payment_id: String(paymentId),
  });

  if (error) {
    console.error("[Elite Promo] Claim failed:", error.message);
    return { eligible: true, granted: false, error: error.message };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (row?.granted) {
    const { error: fulfillmentUpdateError } = await adminSupabase
      .from("store_requests")
      .update({ product_name: "DesaynScale — Elite Launch Bonus" })
      .eq("user_id", userId)
      .eq("product_name", "Subli Autoresizer — Elite Launch Bonus")
      .eq("status", "pending");

    if (fulfillmentUpdateError) {
      console.warn("[Elite Promo] Could not update the fulfillment label:", fulfillmentUpdateError.message);
    }
  }

  return {
    eligible: true,
    granted: Boolean(row?.granted),
    alreadyEntitled: Boolean(row?.already_entitled),
    claimNumber: Number(row?.claim_number || 0) || null,
    remainingSlots: Number(row?.slots_remaining ?? ELITE_AUTORESIZER_PROMO_LIMIT),
  };
}

export async function getEliteAutoresizerPromoStatus() {
  if (!adminSupabase) {
    return { configured: false, limit: ELITE_AUTORESIZER_PROMO_LIMIT, claimed: 0, remaining: 0 };
  }

  const { count, error } = await adminSupabase
    .from("elite_autoresizer_promo_claims")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.warn("[Elite Promo] Status unavailable:", error.message);
    return { configured: false, limit: ELITE_AUTORESIZER_PROMO_LIMIT, claimed: 0, remaining: 0 };
  }

  const claimed = Math.min(Number(count || 0), ELITE_AUTORESIZER_PROMO_LIMIT);
  return {
    configured: true,
    limit: ELITE_AUTORESIZER_PROMO_LIMIT,
    claimed,
    remaining: Math.max(0, ELITE_AUTORESIZER_PROMO_LIMIT - claimed),
  };
}
