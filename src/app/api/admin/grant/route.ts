import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { AuthError, getAuthSetupErrorCode, grantAccess } from "@/lib/auth";
import { isValidEmail } from "@/lib/validation";

export const runtime = "nodejs";

type GrantBody = {
  email?: unknown;
  subscriptionUrl?: unknown;
};

const MAX_SUBSCRIPTION_URL_LENGTH = 4096;
const ALLOWED_CONFIG_PROTOCOLS = new Set([
  "https:",
  "http:",
  "vless:",
  "vmess:",
  "trojan:",
  "ss:",
  "hysteria2:",
  "hy2:",
  "wireguard:",
]);

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

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid_email" }, { status: 400 });
  }

  const subscriptionUrl =
    typeof body.subscriptionUrl === "string" ? body.subscriptionUrl.trim() : "";
  if (!subscriptionUrl) {
    return NextResponse.json(
      { ok: false, error: "subscription_url_required" },
      { status: 400 }
    );
  }
  if (!isAllowedSubscriptionUrl(subscriptionUrl)) {
    return NextResponse.json(
      { ok: false, error: "invalid_subscription_url" },
      { status: 400 }
    );
  }

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

function isAllowedSubscriptionUrl(value: string): boolean {
  if (value.length > MAX_SUBSCRIPTION_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return ALLOWED_CONFIG_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}
