import { NextResponse } from "next/server";
import { getCapacity } from "@/lib/capacity";

export const runtime = "nodejs";

// Public read-only endpoint used by /pricing to render the X / 300
// counter and toggle the pool-full state. Soft-fails to a sensible
// default if KV is down — the page still renders something rather
// than blowing up the whole route.
export async function GET() {
  try {
    const capacity = await getCapacity();
    return NextResponse.json({ ok: true, ...capacity });
  } catch (err) {
    console.warn("[capacity] read failed", err);
    const fallbackExpansion = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    // Omit display/target on soft-fail so the client guard stays in its
    // loading skeleton (···/···) instead of rendering a real "0/300 sold",
    // which would broadcast zero demand on a scarcity-marketed page.
    return NextResponse.json(
      {
        ok: false,
        full: false,
        expansionAtIso: fallbackExpansion.toISOString(),
        vipContactUrl: "https://t.me/prsloy",
      },
      { status: 200 }
    );
  }
}
