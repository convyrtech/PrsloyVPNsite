import { NextResponse } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { AuthError, deleteUser, getAuthSetupErrorCode, listUsers } from "@/lib/auth";
import { writeAuditEntry } from "@/lib/admin-audit";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Account deletion is the highest-impact admin mutation — cap it and audit
// it (spec §2). Global per-action key; fails open. GET (list) stays
// unlimited, like /lookup.
const DELETE_LIMIT = 20;
const DELETE_WINDOW_SECONDS = 60;

type DeleteBody = {
  userId?: unknown;
};

export async function GET(req: Request) {
  const blocked = guardAdmin(req);
  if (blocked) return blocked;

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

export async function DELETE(req: Request) {
  const blocked = guardAdmin(req);
  if (blocked) return blocked;

  const limited = await rateLimit("admin-users-delete", "op", DELETE_LIMIT, DELETE_WINDOW_SECONDS);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  let body: DeleteBody;
  try {
    body = (await req.json()) as DeleteBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  }

  try {
    const user = await deleteUser(userId);
    await writeAuditEntry({
      action: "delete",
      targetUserId: user.id,
      targetEmail: user.email,
      result: "ok",
    });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (err instanceof AuthError && err.code === "not_found") {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }
    console.warn("[admin] delete user failed", err);
    return NextResponse.json({ ok: false, error: "delete_failed" }, { status: 500 });
  }
}

function guardAdmin(req: Request): NextResponse | null {
  // Without ADMIN_SECRET the endpoint is disabled and indistinguishable
  // from a route that does not exist.
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}
