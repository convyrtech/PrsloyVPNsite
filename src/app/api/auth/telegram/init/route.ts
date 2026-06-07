import { NextResponse } from "next/server";
import { getAuthSetupErrorCode } from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  buildDeepLink,
  isTelegramConfigured,
  mintNonce,
  NONCE_TTL_SECONDS,
} from "@/lib/telegram-auth";

export const runtime = "nodejs";

// Same per-IP budget as register: a real user makes 1-2 init calls; a
// scripted attacker would need many to fish for nonces (which are then
// guarded by the webhook secret anyway).
const INIT_LIMIT = 5;
const INIT_WINDOW_SECONDS = 60;

export async function POST(req: Request) {
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: "telegram_not_configured" },
      { status: 503 }
    );
  }

  const limit = await rateLimit(
    "tg-init",
    getClientIp(req),
    INIT_LIMIT,
    INIT_WINDOW_SECONDS,
    { failClosed: true }
  );
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  try {
    const nonce = await mintNonce();
    return NextResponse.json({
      ok: true,
      nonce,
      deepLink: buildDeepLink(nonce),
      expiresInSeconds: NONCE_TTL_SECONDS,
    });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json(
        { ok: false, error: setupError },
        { status: 503 }
      );
    }
    console.warn("[auth] telegram init failed", err);
    return NextResponse.json(
      { ok: false, error: "init_failed" },
      { status: 500 }
    );
  }
}
