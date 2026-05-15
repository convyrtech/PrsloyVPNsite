import { NextResponse } from "next/server";
import { getAuthSetupErrorCode, getCurrentUser } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, user: await getCurrentUser() });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[auth] current user failed", err);
    return NextResponse.json({ ok: false, error: "me_failed" }, { status: 500 });
  }
}
