import { NextResponse } from "next/server";
import { reconcilePendingDodoPayments } from "@/lib/dodoPaymentService";
import { retryFailedDesaynscaleDeliveries } from "@/lib/eliteDesaynscalePromo";

export const runtime = "nodejs";
export const maxDuration = 60;

const DEADLINE_MS = (maxDuration - 8) * 1000;

export async function GET(request) {
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const deadline = () => Date.now() - start >= DEADLINE_MS;

  try {
    const result = await reconcilePendingDodoPayments({ deadline });
    const desaynscaleDeliveries = deadline()
      ? { scanned: 0, sent: 0, failed: 0 }
      : await retryFailedDesaynscaleDeliveries({ deadline });
    return NextResponse.json({
      success: result.errors === 0 && desaynscaleDeliveries.failed === 0,
      elapsedSeconds: Number(((Date.now() - start) / 1000).toFixed(1)),
      ...result,
      desaynscaleDeliveries,
    });
  } catch (error) {
    console.error("[Payment reconciliation] Failed:", error);
    return NextResponse.json({ error: "Payment reconciliation failed" }, { status: 500 });
  }
}
