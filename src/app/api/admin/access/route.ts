import { NextResponse } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { AuthError, getAuthSetupErrorCode, setAccessBlocked } from "@/lib/auth";
import { writeAuditEntry } from "@/lib/admin-audit";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Cap authorized block/unblock throughput (spec §2). Global per-action key
// — single ADMIN_SECRET, so the cap bounds total throughput regardless of
// source IP. Fails open.
const ACCESS_LIMIT = 30;
const ACCESS_WINDOW_SECONDS = 60;

type AccessBody = {
  userId?: unknown;
  blocked?: unknown;
};

// Block / unblock a user's access on our side. "blocked" hides the Ключ in
// the ЛК; it does not revoke the Marzneshin config (Phase 2). Audited so a
// moderation action can be reconstructed under the single ADMIN_SECRET.
export async function PATCH(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit("admin-access", "op", ACCESS_LIMIT, ACCESS_WINDOW_SECONDS);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  let body: AccessBody;
  try {
    body = (await req.json()) as AccessBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });
  }
  if (typeof body.blocked !== "boolean") {
    return NextResponse.json({ ok: false, error: "blocked_required" }, { status: 400 });
  }
  const blocked = body.blocked;

  try {
    const user = await setAccessBlocked(userId, blocked);
    // Best-effort audit (writeAuditEntry never throws); records the toggle
    // even though the single secret means we can't capture "who".
    await writeAuditEntry({
      action: blocked ? "block" : "unblock",
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
    console.warn("[admin] access toggle failed", err);
    return NextResponse.json({ ok: false, error: "access_failed" }, { status: 500 });
  }
}
