import { NextResponse } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { AccessPoolError, addInviteCodes } from "@/lib/access-pool";
import { KvNotConfiguredError } from "@/lib/kv";
import { rateLimit } from "@/lib/rate-limit";
import { writeAuditEntry } from "@/lib/admin-audit";

export const runtime = "nodejs";

const MAX_CODES_PER_REQUEST = 1000;
// Cap invite-code creation per spec §2. Global per-action key; fails open.
const POOL_ADD_LIMIT = 20;
const POOL_ADD_WINDOW_SECONDS = 60;

type AddBody = {
  codes?: unknown;
};

export async function POST(req: Request) {
  // Without ADMIN_SECRET the endpoint is disabled and indistinguishable
  // from a route that does not exist.
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit("admin-pool-add", "op", POOL_ADD_LIMIT, POOL_ADD_WINDOW_SECONDS);
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  let body: AddBody;
  try {
    body = (await req.json()) as AddBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const codes = Array.isArray(body.codes) ? body.codes : null;
  if (!codes) {
    return NextResponse.json(
      { ok: false, error: "codes_required" },
      { status: 400 }
    );
  }
  if (codes.length === 0) {
    return NextResponse.json({ ok: false, error: "empty_input" }, { status: 400 });
  }
  if (codes.length > MAX_CODES_PER_REQUEST) {
    return NextResponse.json(
      { ok: false, error: "too_many_codes" },
      { status: 400 }
    );
  }
  if (!codes.every((c) => typeof c === "string")) {
    return NextResponse.json(
      { ok: false, error: "invalid_code" },
      { status: 400 }
    );
  }

  try {
    const result = await addInviteCodes(codes as string[]);
    // No single target user — record the counts in `detail` (spec §2).
    await writeAuditEntry({
      action: "codes_added",
      targetEmail: null,
      result: "ok",
      detail: `added ${result.added}, skipped ${result.skipped}`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof KvNotConfiguredError) {
      return NextResponse.json(
        { ok: false, error: "kv_not_configured" },
        { status: 503 }
      );
    }
    if (err instanceof AccessPoolError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: 400 });
    }
    console.warn("[admin] access-pool add failed", err);
    return NextResponse.json({ ok: false, error: "add_failed" }, { status: 500 });
  }
}
