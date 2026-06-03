import { NextResponse, after } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { getAuthSetupErrorCode } from "@/lib/auth";
import { AdminIssueError, performAdminIssue } from "@/lib/admin-issue";
import { getMarzneshinProxyErrorCode, periodToDays } from "@/lib/marzneshin-proxy";
import { PERIODS, type Period } from "@/lib/pricing";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";

type IssueBody = {
  email?: unknown;
  period?: unknown; // "1mo" | "6mo" | "1yr"
  days?: unknown; // custom override (comps)
  comp?: unknown;
  note?: unknown;
  reissueRequestId?: unknown;
};

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_NOTE = 500;
const MAX_CUSTOM_DAYS = 3650; // 10y ceiling for comps

const ERROR_STATUS: Record<string, number> = {
  proxy_not_configured: 503,
  user_not_found: 404,
  user_blocked: 409,
};

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: IssueBody;
  try {
    body = (await req.json()) as IssueBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email || !EMAIL_SHAPE.test(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  // Period: an explicit day count (custom comps) wins; otherwise a known plan.
  let periodDays: number;
  if (typeof body.days === "number" && Number.isFinite(body.days)) {
    const d = Math.floor(body.days);
    if (d < 1 || d > MAX_CUSTOM_DAYS) {
      return NextResponse.json({ ok: false, error: "invalid_period" }, { status: 400 });
    }
    periodDays = d;
  } else if (
    typeof body.period === "string" &&
    (PERIODS as readonly string[]).includes(body.period)
  ) {
    periodDays = periodToDays(body.period as Period);
  } else {
    return NextResponse.json({ ok: false, error: "period_required" }, { status: 400 });
  }

  const comp = body.comp === true;
  const note =
    typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : "";
  if (comp && !note) {
    return NextResponse.json(
      { ok: false, error: "note_required_for_comp" },
      { status: 400 }
    );
  }
  const reissueRequestId =
    typeof body.reissueRequestId === "string" ? body.reissueRequestId.trim() : null;

  try {
    const result = await performAdminIssue({
      email,
      periodDays,
      comp,
      note: note || null,
      reissueRequestId,
    });
    after(() => track({ name: "key_issued", userId: result.user.id }));
    return NextResponse.json({
      ok: true,
      user: result.user,
      subscriptionUrl: result.subscriptionUrl,
      action: result.action,
    });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    const proxyCode = getMarzneshinProxyErrorCode(err);
    if (proxyCode) {
      return NextResponse.json({ ok: false, error: proxyCode }, { status: 502 });
    }
    if (err instanceof AdminIssueError) {
      const status = ERROR_STATUS[err.code] ?? 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    console.warn("[admin] issue failed", err);
    return NextResponse.json({ ok: false, error: "issue_failed" }, { status: 500 });
  }
}
