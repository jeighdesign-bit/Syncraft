import { NextResponse } from "next/server";
import { adminSupabase } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "").trim();
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token);
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const paymentId = new URL(request.url).searchParams.get("paymentId");
  if (!paymentId) return NextResponse.json({ error: "Missing payment ID" }, { status: 400 });

  const { data: payment, error } = await adminSupabase
    .from("b2b_paymongo_payments")
    .select("id, status, credits, amount, currency, credited_at")
    .eq("id", paymentId)
    .eq("user_id", user.id)
    .single();
  if (error || !payment) return NextResponse.json({ error: "Payment not found" }, { status: 404 });

  return NextResponse.json({ payment });
}

