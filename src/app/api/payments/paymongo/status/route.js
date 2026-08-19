import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";
import { getPaymongoAuthHeaders } from "@/lib/paymongo";
import { handlePaymongoPaymentSucceeded } from "@/lib/paymongoPaymentService";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const localPaymentId = searchParams.get("localPaymentId");

    if (!localPaymentId) {
      return NextResponse.json({ error: "Missing localPaymentId" }, { status: 400 });
    }

    const { data: payment, error } = await adminSupabase
      .from("paymongo_payments")
      .select("*")
      .eq("id", localPaymentId)
      .single();

    if (error || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
    }

    // If already marked as paid in local database, return immediately
    if (payment.status === "paid") {
      return NextResponse.json({ status: "paid" });
    }

    // Safety fallback: if webhook was delayed, actively check PayMongo API
    const intentId = payment.paymongo_checkout_session_id;
    if (intentId && intentId.startsWith("pi_")) {
      try {
        const headers = getPaymongoAuthHeaders();
        const res = await fetch(`https://api.paymongo.com/v1/payment_intents/${intentId}`, {
          headers,
          cache: "no-store",
        });

        if (res.ok) {
          const json = await res.json();
          const intentStatus = json?.data?.attributes?.status;

          if (intentStatus === "succeeded") {
            // Instant crediting via service
            await handlePaymongoPaymentSucceeded(json.data);
            return NextResponse.json({ status: "paid" });
          } else if (intentStatus === "failed" || intentStatus === "cancelled") {
            return NextResponse.json({ status: "failed" });
          }
        }
      } catch (checkErr) {
        console.error("[PayMongo Status Poll] Direct check error:", checkErr?.message);
      }
    }

    return NextResponse.json({ status: payment.status });
  } catch (error) {
    console.error("[PayMongo Status] Error:", error?.message);
    return NextResponse.json(
      { error: "Failed to check status" },
      { status: 500 }
    );
  }
}
