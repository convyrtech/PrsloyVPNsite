import { NextResponse } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { getAuthSetupErrorCode, listUsers } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(req: Request) {
  // Without ADMIN_SECRET the endpoint is disabled and indistinguishable
  // from a route that does not exist.
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const users = await listUsers();
    return NextResponse.json({ ok: true, users });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[admin] list users failed", err);
    return NextResponse.json({ ok: false, error: "list_failed" }, { status: 500 });
  }
}
