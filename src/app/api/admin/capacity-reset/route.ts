import { NextResponse } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { getCapacity, resetPayingCounter } from "@/lib/capacity";
import { writeAuditEntry } from "@/lib/admin-audit";
import { rateLimit } from "@/lib/rate-limit";
import { KvNotConfiguredError } from "@/lib/kv";

export const runtime = "nodejs";

// Reset the public "paying" capacity counter to 0 (operator tool — e.g.
// clearing a test/reprocess increment). Mutating + audited per spec §2.
const RESET_LIMIT = 10;
const RESET_WINDOW_SECONDS = 60;

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(
    "admin-capacity-reset",
    "op",
    RESET_LIMIT,
    RESET_WINDOW_SECONDS
  );
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  try {
    await resetPayingCounter();
    await writeAuditEntry({
      action: "capacity_reset",
      targetEmail: null,
      result: "ok",
    });
    const capacity = await getCapacity();
    return NextResponse.json({ ok: true, capacity });
  } catch (err) {
    if (err instanceof KvNotConfiguredError) {
      return NextResponse.json({ ok: false, error: "kv_not_configured" }, { status: 503 });
    }
    console.warn("[admin] capacity reset failed", err);
    return NextResponse.json({ ok: false, error: "reset_failed" }, { status: 500 });
  }
}
