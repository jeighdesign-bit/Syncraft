import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { refundCreditVerified } from "@/lib/creditLedger";

export async function POST(request) {
  try {
    const { projectId } = await request.json();

    if (!projectId) {
      return NextResponse.json({ error: "Missing projectId" }, { status: 400 });
    }

    // Verify who is making the request
    const authHeader = request.headers.get("authorization");
    if (!authHeader) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 });
    }

    // Fetch project — use shared adminSupabase singleton (no new DB connections per request)
    const { data: proj } = await adminSupabase
      .from('projects')
      .select('user_id, credit_deducted, refunded')
      .eq('id', projectId)
      .single();
    
    // Security check: only the project owner can request a refund
    if (!proj || proj.user_id !== user.id) {
      return NextResponse.json({ error: "Project not found or access denied" }, { status: 403 });
    }

    if (!proj.credit_deducted || proj.refunded) {
      return NextResponse.json({ error: "Project is not eligible for refund" }, { status: 409 });
    }

    const { data: chargeLog, error: chargeLogErr } = await adminSupabase
      .from('credit_logs')
      .select('id')
      .eq('user_id', user.id)
      .eq('project_id', projectId)
      .eq('transaction_type', 'charge')
      .eq('feature', 'garment_logo_extract')
      .lt('amount', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (chargeLogErr || !chargeLog) {
      return NextResponse.json({ error: "No matching credit deduction record found" }, { status: 409 });
    }

    const { data: failedUsage, error: failedUsageError } = await adminSupabase
      .from('provider_usage_logs')
      .select('id')
      .eq('credit_transaction_id', chargeLog.id)
      .eq('project_id', projectId)
      .eq('request_status', 'failed')
      .limit(1)
      .maybeSingle();
    if (failedUsageError || !failedUsage) {
      return NextResponse.json({ error: "No verified generation failure found" }, { status: 409 });
    }

    const refund = await refundCreditVerified({
      chargeTransactionId: chargeLog.id,
      reason: "User-visible generation failure",
      action: "Refund",
      metadata: { route: "api/refund" },
    });
    if (!refund.refunded) {
      return NextResponse.json({ error: refund.reason || "Credit refund could not be verified" }, { status: 409 });
    }

    const { error: updateErr } = await adminSupabase
      .from('projects')
      .update({ generated_image_url: 'REFUNDED', refunded: true })
      .eq('id', projectId)
      .eq('user_id', user.id);
    if (updateErr) throw updateErr;

    console.log(`[Refund API] ✅ Successfully processed refund for project ${projectId} (User: ${user.id})`);
    
    return NextResponse.json({ success: true, message: "Refund processed successfully" });

  } catch (error) {
    console.error(`[Refund API Error]:`, error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
