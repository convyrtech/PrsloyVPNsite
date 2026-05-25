import { NextResponse } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { getPaymentSetupErrorCode } from "@/lib/payments";
import {
  readDailyAggregate,
  readRecentEvents,
} from "@/lib/analytics-admin";
import { todayKey, type AnalyticsEnv } from "@/lib/analytics";

export const runtime = "nodejs";

const ALLOWED_ENVS: ReadonlySet<AnalyticsEnv> = new Set(["prod", "preview", "dev"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date")?.trim() ?? "";
  const envParam = url.searchParams.get("env")?.trim() ?? "";
  const includeLog = url.searchParams.get("log") === "1";

  const date = ISO_DATE.test(dateParam) ? dateParam : todayKey();
  // Default to prod — admin almost always wants production numbers.
  // The env switch is for debugging preview/dev runs.
  const env: AnalyticsEnv = ALLOWED_ENVS.has(envParam as AnalyticsEnv)
    ? (envParam as AnalyticsEnv)
    : "prod";

  try {
    const aggregate = await readDailyAggregate(date, env);
    const events = includeLog ? await readRecentEvents(date, 50, env) : [];
    return NextResponse.json({ ok: true, aggregate, events });
  } catch (err) {
    const setupError = getPaymentSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[admin] analytics read failed", err);
    return NextResponse.json({ ok: false, error: "read_failed" }, { status: 500 });
  }
}
