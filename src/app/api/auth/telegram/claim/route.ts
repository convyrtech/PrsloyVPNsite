import { NextResponse, after } from "next/server";
import {
  AuthError,
  createSession,
  getAuthSetupErrorCode,
  loginOrRegisterByTelegram,
  setSessionCookie,
} from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { isTelegramConfigured, tryClaimNonce } from "@/lib/telegram-auth";
import { sanitizeKeyPart, track } from "@/lib/analytics";

export const runtime = "nodejs";

// Polled by the browser every 1-5s. Generous per-IP budget so adaptive
// backoff during a normal sign-in (up to ~15 polls over 90s) never trips
// rate-limit, while a runaway loop still gets stopped.
const CLAIM_LIMIT = 60;
const CLAIM_WINDOW_SECONDS = 120;
const NONCE_PATTERN = /^[A-Za-z0-9_-]+$/;

type ClaimBody = {
  nonce?: unknown;
  utmSource?: unknown;
};

export async function POST(req: Request) {
  if (!isTelegramConfigured()) {
    return NextResponse.json(
      { ok: false, error: "telegram_not_configured" },
      { status: 503 }
    );
  }

  const limit = await rateLimit(
    "tg-claim",
    getClientIp(req),
    CLAIM_LIMIT,
    CLAIM_WINDOW_SECONDS,
    { failClosed: true }
  );
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: ClaimBody;
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const nonce = typeof body.nonce === "string" ? body.nonce.trim() : "";
  if (!nonce || !NONCE_PATTERN.test(nonce)) {
    return NextResponse.json(
      { ok: false, error: "invalid_nonce" },
      { status: 400 }
    );
  }

  const rawUtm = typeof body.utmSource === "string" ? body.utmSource : "";
  const utmSource = rawUtm ? sanitizeKeyPart(rawUtm) || undefined : undefined;

  try {
    const outcome = await tryClaimNonce(nonce);
    if (outcome.status === "pending") {
      return NextResponse.json({ ok: false, status: "pending" }, { status: 202 });
    }
    if (outcome.status === "expired") {
      return NextResponse.json(
        { ok: false, error: "nonce_expired" },
        { status: 410 }
      );
    }
    if (outcome.status === "consumed") {
      return NextResponse.json(
        { ok: false, error: "nonce_consumed" },
        { status: 410 }
      );
    }

    const { user, isNew } = await loginOrRegisterByTelegram({
      telegramId: outcome.telegramId,
      telegramUsername: outcome.telegramUsername,
    });
    const session = await createSession(user.id);

    // Only true first-time registrations count toward the funnel — a
    // returning Telegram user opening /login isn't a new conversion.
    if (isNew) {
      after(() =>
        track({
          name: "register_success",
          userId: user.id,
          ...(utmSource ? { utmSource } : {}),
        })
      );
    }

    const res = NextResponse.json({ ok: true, user, isNew });
    setSessionCookie(res, session);
    return res;
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json(
        { ok: false, error: setupError },
        { status: 503 }
      );
    }
    if (err instanceof AuthError) {
      const status = err.code === "telegram_id_taken" ? 409 : 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    console.warn("[auth] telegram claim failed", err);
    return NextResponse.json(
      { ok: false, error: "claim_failed" },
      { status: 500 }
    );
  }
}
