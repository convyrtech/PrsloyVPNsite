import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { AuthError, getAuthSetupErrorCode, grantAccess } from "@/lib/auth";

export const runtime = "nodejs";

type GrantBody = {
  email?: unknown;
  subscriptionUrl?: unknown;
};

// Constant-time compare via fixed-length digests — avoids leaking
// the secret length and short-circuiting on the first wrong byte.
function isAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  // Without ADMIN_SECRET the endpoint is disabled and indistinguishable
  // from a route that does not exist.
  if (!process.env.ADMIN_SECRET?.trim()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: GrantBody;
  try {
    body = (await req.json()) as GrantBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  if (!email.trim()) {
    return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
  }
  const subscriptionUrl =
    typeof body.subscriptionUrl === "string" ? body.subscriptionUrl : undefined;

  try {
    const user = await grantAccess(email, { subscriptionUrl });
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (err instanceof AuthError && err.code === "not_found") {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }
    if (err instanceof AuthError && err.code === "subscription_url_required") {
      return NextResponse.json(
        { ok: false, error: "subscription_url_required" },
        { status: 400 }
      );
    }
    console.warn("[admin] grant failed", err);
    return NextResponse.json({ ok: false, error: "grant_failed" }, { status: 500 });
  }
}
