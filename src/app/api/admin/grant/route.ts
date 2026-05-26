import { NextResponse, after } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { AuthError, getAuthSetupErrorCode, grantAccess } from "@/lib/auth";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";

type GrantBody = {
  // `identifier` is the canonical field name (email, @username, or
  // numeric Telegram id). `email` stays accepted for back-compat with
  // any tooling still posting the older shape.
  identifier?: unknown;
  email?: unknown;
  subscriptionUrl?: unknown;
};

const MAX_IDENTIFIER_LENGTH = 256;

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

export async function POST(req: Request) {
  // Without ADMIN_SECRET the endpoint is disabled and indistinguishable
  // from a route that does not exist.
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: GrantBody;
  try {
    body = (await req.json()) as GrantBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const rawIdentifier =
    typeof body.identifier === "string"
      ? body.identifier
      : typeof body.email === "string"
        ? body.email
        : "";
  const identifier = rawIdentifier.trim();
  if (!identifier) {
    return NextResponse.json(
      { ok: false, error: "identifier_required" },
      { status: 400 }
    );
  }
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "invalid_identifier" },
      { status: 400 }
    );
  }
  // Three shapes the resolver knows: numeric Telegram id, @username, or
  // an email. Anything else is a typo — surface as invalid_identifier so
  // the operator sees "формат неверен" instead of 404 user_not_found.
  if (!isAllowedIdentifierShape(identifier)) {
    return NextResponse.json(
      { ok: false, error: "invalid_identifier" },
      { status: 400 }
    );
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
    const user = await grantAccess(identifier, { subscriptionUrl });
    after(() => track({ name: "key_issued", userId: user.id }));
    return NextResponse.json({ ok: true, user });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (err instanceof AuthError && err.code === "not_found") {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }
    if (err instanceof AuthError && err.code === "user_blocked") {
      return NextResponse.json({ ok: false, error: "user_blocked" }, { status: 409 });
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

// One of: numeric Telegram id (e.g. 12345), @username (Telegram alias,
// 5–32 alphanumeric/underscore), or an RFC-shaped email. Resolver
// downstream dispatches by the same three shapes — keep them in sync.
const TELEGRAM_NUMERIC = /^\d{1,20}$/;
const TELEGRAM_USERNAME = /^@[A-Za-z0-9_]{4,32}$/;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isAllowedIdentifierShape(value: string): boolean {
  return (
    TELEGRAM_NUMERIC.test(value) ||
    TELEGRAM_USERNAME.test(value) ||
    EMAIL_SHAPE.test(value)
  );
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
