import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { CREDIT_PLANS } from "@/lib/paymentPlans";
import { authenticateAdminRequest } from "@/lib/adminAuth";
import { claimEliteDesaynscalePromo } from "@/lib/eliteDesaynscalePromo";
import { sendPaymentReceipt } from "@/lib/transactionalEmail";
import {
  PAYMENT_STATUS,
  addsCreditsForStatus,
  getApprovalStatus,
} from "@/lib/paymentApprovalRules.mjs";

const PLAN_CREDITS = {
  tingi: CREDIT_PLANS.tingi.credits,
  basic: CREDIT_PLANS.basic.credits,
  starter: CREDIT_PLANS.starter.credits,
  pro: CREDIT_PLANS.pro.credits,
  elite: CREDIT_PLANS.elite.credits
};

export async function POST(request) {
  try {
    const adminAuth = await authenticateAdminRequest(request);
    if (!adminAuth.user) {
      return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });
    }

    const { requestId, markOnly } = await request.json();
    if (!requestId) {
      return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
    }

    const { data: paymentRequest, error: fetchErr } = await adminSupabase
      .from('payment_requests')
      .select('*')
      .eq('id', requestId)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !paymentRequest) {
      return NextResponse.json({ error: "Payment request not found or already approved." }, { status: 409 });
    }

    const savedCredits = Number(paymentRequest.credits);
    const creditsToAdd = Number.isInteger(savedCredits) && savedCredits > 0
      ? savedCredits
      : PLAN_CREDITS[paymentRequest.plan] || 0;
    const approvalStatus = getApprovalStatus(markOnly);
    const shouldAddCredits = addsCreditsForStatus(approvalStatus);

    if (shouldAddCredits && creditsToAdd <= 0) {
      return NextResponse.json({ error: "Invalid payment plan." }, { status: 400 });
    }

    const { data: claimedRequest, error: claimErr } = await adminSupabase
      .from('payment_requests')
      .update({ status: approvalStatus })
      .eq('id', requestId)
      .eq('status', 'pending')
      .select('*')
      .single();

    if (claimErr || !claimedRequest) {
      return NextResponse.json({ error: "Payment request already approved." }, { status: 409 });
    }

    let elitePromo = { eligible: false };

    if (shouldAddCredits) {
      const { error: updateProfileErr } = await adminSupabase
        .rpc('increment_credits', { user_id: claimedRequest.user_id, amount: creditsToAdd });

      if (updateProfileErr) {
        console.error("Failed to update credits:", updateProfileErr);
        await adminSupabase
          .from('payment_requests')
          .update({ status: 'pending' })
          .eq('id', requestId)
          .eq('status', PAYMENT_STATUS.APPROVED);
        return NextResponse.json({ error: "Failed to update credits." }, { status: 500 });
      }

      // Log the transaction
      await adminSupabase.from('credit_logs').insert({
        user_id: claimedRequest.user_id,
        action: 'Top-Up via GCash',
        amount: creditsToAdd
      });

      const isCurrentEliteOffer = claimedRequest.plan === "elite"
        && Number(claimedRequest.amount || CREDIT_PLANS.elite.amount) === CREDIT_PLANS.elite.amount
        && creditsToAdd === CREDIT_PLANS.elite.credits;

      if (isCurrentEliteOffer) {
        elitePromo = await claimEliteDesaynscalePromo({
          userId: claimedRequest.user_id,
          email: claimedRequest.email,
          planKey: claimedRequest.plan,
          paymentSource: "gcash",
          paymentId: claimedRequest.id,
        });
      }
    }

    if (shouldAddCredits) {
      const plan = CREDIT_PLANS[claimedRequest.plan];
      await sendPaymentReceipt({
        to: claimedRequest.email,
        provider: "GCash",
        plan: plan?.label || claimedRequest.plan,
        credits: creditsToAdd,
        amount: new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: "PHP",
        }).format(Number(claimedRequest.amount || plan?.amount || 0) / 100),
        reference: claimedRequest.reference_number || null,
        paymentRecordId: claimedRequest.id,
      });
    }

    return NextResponse.json({
      success: true,
      status: approvalStatus,
      addedCredits: shouldAddCredits ? creditsToAdd : 0,
      countsAsRevenue: shouldAddCredits,
      elitePromo,
    });
  } catch (error) {
    console.error("Admin Approval Error:", error);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
