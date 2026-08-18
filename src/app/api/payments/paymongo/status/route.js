import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";

export const runtime = "edge";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const localPaymentId = searchParams.get("localPaymentId");

    if (!localPaymentId) {
      return NextResponse.json({ error: "Missing localPaymentId" }, { status: 400 });
    }

    const { data: payment, error } = await adminSupabase
      .from("paymongo_payments")
      .select("status")
      .eq("id", localPaymentId)
      .single();

    if (error || !payment) {
      return NextResponse.json({ error: "Payment not found" }, { status: 404 });
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
