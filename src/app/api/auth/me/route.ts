import { NextResponse } from "next/server";
import { getCurrentUser, isAuthSetupError } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json({ ok: true, user: await getCurrentUser() });
  } catch (err) {
    if (isAuthSetupError(err)) {
      return NextResponse.json({ ok: false, error: "auth_not_configured" }, { status: 503 });
    }
    console.warn("[auth] current user failed", err);
    return NextResponse.json({ ok: false, error: "me_failed" }, { status: 500 });
  }
}
