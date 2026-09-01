import { NextResponse } from "next/server";
import { getEliteDesaynscalePromoStatus } from "@/lib/eliteDesaynscalePromo";

export const dynamic = "force-dynamic";

export async function GET() {
  const promo = await getEliteDesaynscalePromoStatus();
  return NextResponse.json(promo, {
    headers: { "Cache-Control": "no-store" },
  });
}
