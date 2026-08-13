import { NextResponse } from "next/server";
import { getEliteAutoresizerPromoStatus } from "@/lib/eliteAutoresizerPromo";

export const dynamic = "force-dynamic";

export async function GET() {
  const promo = await getEliteAutoresizerPromoStatus();
  return NextResponse.json(promo, {
    headers: { "Cache-Control": "no-store" },
  });
}
