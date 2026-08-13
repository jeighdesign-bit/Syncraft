import { adminSupabase } from "@/lib/supabase";
import { getDodoClient } from "@/lib/dodo";
import { getCreditPlan } from "@/lib/paymentPlans";
import { Resend } from "resend";
import { claimEliteAutoresizerPromo } from "@/lib/eliteAutoresizerPromo";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export function resolveLocalPaymentQuery(payment) {
  const metadataId = payment?.metadata?.local_payment_id;
  if (metadataId) return { column: "id", value: metadataId };

  if (payment?.checkout_session_id) {
    return { column: "dodo_checkout_session_id", value: payment.checkout_session_id };
  }

  return null;
}

export async function markDodoPaymentStatus(payment, status) {
  const query = resolveLocalPaymentQuery(payment);
  if (!query) {
    console.warn(`[Dodo] Cannot mark ${status}: missing local payment reference`);
    return false;
  }

  const update = {
    status,
    dodo_payment_id: payment?.payment_id || undefined,
    amount: Number.isFinite(payment?.total_amount) ? payment.total_amount : undefined,
    currency: payment?.currency || undefined,
  };

  const { error } = await adminSupabase
    .from("dodo_payments")
    .update(update)
    .eq(query.column, query.value)
    .neq("status", "paid");

  if (error) throw error;
  return true;
}

async function sendDodoPaymentEmail({ email, plan, credits, paymentId, elitePromo }) {
  if (!resend || !email) return;

  try {
    await resend.emails.send({
      from: "Syncraft <hello@syncraft.com>",
      to: email,
      subject: "Payment Successful - Credits Added",
      html: `
        <div style="background:#1a1a1a;color:#fff;font-family:Arial,sans-serif;padding:40px 20px;text-align:center">
          <div style="max-width:500px;margin:0 auto;background:#262626;border:1px solid #444;padding:40px 30px;border-radius:8px">
            <h2>Payment Successful</h2>
            <p style="color:#ccc;line-height:1.6">Your Dodo payment was confirmed and your credits were automatically added.</p>
            <p>Plan: <strong>${plan}</strong></p>
            <p>Credits added: <strong style="color:#d4ff59">+${credits}</strong></p>
            <p>Payment ID: <strong>${paymentId || "N/A"}</strong></p>
            ${elitePromo?.granted ? `
              <div style="margin-top:24px;padding:18px;border:1px solid #d4ff59;background:rgba(212,255,89,.1);border-radius:6px;text-align:left">
                <strong style="color:#d4ff59">Elite launch bonus unlocked</strong>
                <p style="color:#ddd;line-height:1.5;margin-bottom:0">You are bonus recipient #${elitePromo.claimNumber}. Your free lifetime Subli Autoresizer access is now queued for delivery.</p>
              </div>
            ` : ""}
          </div>
        </div>
      `,
    });
  } catch (error) {
    // Email failure must not cause Dodo to retry a payment that was already credited.
    console.error("[Dodo] Failed to send payment email:", error);
  }
}

export async function handleDodoPaymentSucceeded(payment) {
  const query = resolveLocalPaymentQuery(payment);
  if (!query) throw new Error("Missing local payment reference in Dodo payment metadata");

  const { data: localPayment, error: fetchError } = await adminSupabase
    .from("dodo_payments")
    .select("*")
    .eq(query.column, query.value)
    .single();

  if (fetchError || !localPayment) throw new Error("Local Dodo payment record not found");

  const plan = getCreditPlan(localPayment.plan);
  if (!plan || !Number.isInteger(localPayment.credits) || localPayment.credits <= 0) {
    throw new Error("Local Dodo payment plan is invalid");
  }

  const { data: grantRows, error: grantError } = await adminSupabase.rpc(
    "grant_dodo_payment_credits",
    {
      payment_row_id: localPayment.id,
      provider_payment_id: payment.payment_id || null,
      provider_checkout_session_id:
        payment.checkout_session_id || localPayment.dodo_checkout_session_id || null,
      paid_amount: Number.isFinite(payment.total_amount)
        ? payment.total_amount
        : localPayment.amount,
      paid_currency: payment.currency || localPayment.currency,
    },
  );

  if (grantError) throw new Error(`Failed to add credits: ${grantError.message}`);

  const grant = Array.isArray(grantRows) ? grantRows[0] : grantRows;
  if (!grant?.granted) return { alreadyProcessed: true };

  const { error: logError } = await adminSupabase.from("credit_logs").insert({
    user_id: grant.granted_user_id,
    action: "Top-Up via Dodo",
    amount: grant.granted_credits,
  });

  if (logError) console.error("[Dodo] Credit log insert failed:", logError);

  const elitePromo = localPayment.plan === "elite" && localPayment.credits === plan.credits
    ? await claimEliteAutoresizerPromo({
        userId: grant.granted_user_id,
        email: localPayment.email,
        planKey: localPayment.plan,
        paymentSource: "dodo",
        paymentId: localPayment.id,
      })
    : { eligible: false };

  await sendDodoPaymentEmail({
    email: localPayment.email,
    plan: localPayment.plan,
    credits: grant.granted_credits,
    paymentId: payment.payment_id || null,
    elitePromo,
  });

  return { credited: true, credits: grant.granted_credits, elitePromo };
}

function asPaymentFromSession(session, localPayment) {
  return {
    payment_id: session.payment_id || localPayment.dodo_payment_id || null,
    checkout_session_id: session.id || localPayment.dodo_checkout_session_id,
    metadata: { local_payment_id: localPayment.id },
  };
}

/**
 * Reconcile local pending rows with Dodo. This covers missed webhooks,
 * failed session creation, and abandoned checkouts without touching active
 * payment attempts younger than the grace period.
 */
export async function reconcilePendingDodoPayments({
  staleAfterMs = 24 * 60 * 60 * 1000,
  deadline = () => false,
} = {}) {
  const { data: pendingRows, error: fetchError } = await adminSupabase
    .from("dodo_payments")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(100);

  if (fetchError) throw fetchError;

  const result = {
    scanned: pendingRows?.length || 0,
    credited: 0,
    failed: 0,
    cancelled: 0,
    stillPending: 0,
    errors: 0,
  };
  const client = getDodoClient();

  for (const localPayment of pendingRows || []) {
    if (deadline()) break;

    try {
      if (!localPayment.dodo_checkout_session_id) {
        const { error } = await adminSupabase
          .from("dodo_payments")
          .update({ status: "failed" })
          .eq("id", localPayment.id)
          .eq("status", "pending");
        if (error) throw error;
        result.failed++;
        continue;
      }

      const session = await client.checkoutSessions.retrieve(
        localPayment.dodo_checkout_session_id,
      );
      const paymentStatus = session.payment_status;

      if (paymentStatus === "succeeded" && session.payment_id) {
        const payment = await client.payments.retrieve(session.payment_id);
        await handleDodoPaymentSucceeded({
          ...payment,
          checkout_session_id:
            payment.checkout_session_id || localPayment.dodo_checkout_session_id,
          metadata: {
            ...(payment.metadata || {}),
            local_payment_id: localPayment.id,
          },
        });
        result.credited++;
        continue;
      }

      if (paymentStatus === "failed" || paymentStatus === "cancelled") {
        await markDodoPaymentStatus(
          asPaymentFromSession(session, localPayment),
          "failed",
        );
        result.failed++;
        continue;
      }

      const isStale = Date.now() - new Date(localPayment.created_at).getTime() >= staleAfterMs;
      if (isStale && (paymentStatus === null || paymentStatus === undefined)) {
        await markDodoPaymentStatus(
          asPaymentFromSession(session, localPayment),
          "cancelled",
        );
        result.cancelled++;
      } else {
        result.stillPending++;
      }
    } catch (error) {
      result.errors++;
      console.error(`[Dodo] Pending reconciliation failed for ${localPayment.id}:`, error);
    }
  }

  return result;
}
