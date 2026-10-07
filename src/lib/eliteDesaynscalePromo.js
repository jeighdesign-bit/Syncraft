import "server-only";

import { adminSupabase } from "@/lib/supabase";
import { sendDesaynscaleDeliveryEmail } from "@/lib/transactionalEmail";

async function deliverPendingClaim({
  userId,
  email,
  paymentSource,
  paymentId,
}) {
  const { data: claim, error: claimError } = await adminSupabase
    .from("elite_desaynscale_promo_claims")
    .select("id, email, payment_source, payment_id, delivery_status")
    .eq("user_id", userId)
    .single();

  if (claimError || !claim) {
    console.error("[DesaynScale Promo] Could not load delivery status:", claimError?.message);
    return { sent: false, error: claimError?.message || "Claim not found" };
  }

  if (claim.delivery_status === "sent") {
    return { sent: true, alreadySent: true };
  }

  const delivery = await sendDesaynscaleDeliveryEmail({
    to: claim.email || email,
    paymentSource: claim.payment_source || paymentSource,
    paymentRecordId: claim.payment_id || paymentId,
  });

  const deliveryError = delivery.sent
    ? null
    : String(delivery.error?.message || delivery.reason || "Unknown delivery error").slice(0, 1000);

  const { error: updateError } = await adminSupabase
    .from("elite_desaynscale_promo_claims")
    .update({
      delivery_status: delivery.sent ? "sent" : "failed",
      delivered_at: delivery.sent ? new Date().toISOString() : null,
      delivery_error: deliveryError,
    })
    .eq("id", claim.id);

  if (updateError) {
    console.error("[DesaynScale Promo] Could not save delivery status:", updateError.message);
  }

  return delivery;
}

export async function claimEliteDesaynscalePromo({
  userId,
  email,
  planKey,
  paymentSource,
  paymentId,
}) {
  if (planKey !== "elite") return { eligible: false };
  if (!adminSupabase || !userId || !paymentSource || !paymentId) {
    return { eligible: true, granted: false, error: "Elite access is not configured." };
  }

  const { data, error } = await adminSupabase.rpc("claim_elite_desaynscale_promo", {
    claim_user_id: userId,
    claim_email: email || "",
    claim_payment_source: paymentSource,
    claim_payment_id: String(paymentId),
  });

  if (error) {
    console.error("[DesaynScale Promo] Claim failed:", error.message);
    const delivery = await sendDesaynscaleDeliveryEmail({
      to: email,
      paymentSource,
      paymentRecordId: paymentId,
    });
    return {
      eligible: true,
      granted: delivery.sent,
      delivery,
      fallbackDelivery: true,
      error: error.message,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;
  const granted = Boolean(row?.granted);
  const alreadyEntitled = Boolean(row?.already_entitled);
  const claimNumber = Number(row?.claim_number || 0) || null;
  let delivery = null;

  if (granted || alreadyEntitled) {
    delivery = await deliverPendingClaim({
      userId,
      email,
      paymentSource,
      paymentId,
    });
  } else {
    // Backward compatibility while production still has the original first-10
    // database function. Resend's payment-based idempotency key prevents duplicates.
    delivery = await sendDesaynscaleDeliveryEmail({
      to: email,
      paymentSource,
      paymentRecordId: paymentId,
    });
  }

  return {
    eligible: true,
    granted: granted || Boolean(delivery?.sent),
    alreadyEntitled,
    claimNumber,
    fallbackDelivery: !granted && !alreadyEntitled,
    delivery,
  };
}

export async function getEliteDesaynscalePromoStatus() {
  if (!adminSupabase) {
    return { configured: false, entitled: 0 };
  }

  const { count, error } = await adminSupabase
    .from("elite_desaynscale_promo_claims")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.warn("[DesaynScale Promo] Status unavailable:", error.message);
    return { configured: false, entitled: 0 };
  }

  return {
    configured: true,
    entitled: Number(count || 0),
  };
}

export async function retryFailedDesaynscaleDeliveries({
  limit = 10,
  deadline = () => false,
} = {}) {
  if (!adminSupabase) return { scanned: 0, sent: 0, failed: 0 };

  const { data: claims, error } = await adminSupabase
    .from("elite_desaynscale_promo_claims")
    .select("user_id, email, payment_source, payment_id, claim_number")
    .in("delivery_status", ["pending", "failed"])
    .order("claimed_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  const result = { scanned: claims?.length || 0, sent: 0, failed: 0 };
  for (const claim of claims || []) {
    if (deadline()) break;

    const delivery = await deliverPendingClaim({
      userId: claim.user_id,
      email: claim.email,
      paymentSource: claim.payment_source,
      paymentId: claim.payment_id,
    });

    if (delivery.sent) result.sent++;
    else result.failed++;
  }

  return result;
}
