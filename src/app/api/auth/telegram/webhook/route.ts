import { NextResponse } from "next/server";
import {
  confirmNonce,
  isTelegramConfigured,
  parseStartCommand,
  validateWebhookSecret,
} from "@/lib/telegram-auth";

export const runtime = "nodejs";

// Telegram delivers updates via setWebhook to this URL. The endpoint is
// gated by the X-Telegram-Bot-Api-Secret-Token header set at setWebhook
// time. Without configuration the route is indistinguishable from a
// missing endpoint, so attackers cannot probe.
export async function POST(req: Request) {
  if (!isTelegramConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!validateWebhookSecret(req)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  // Always answer 200 to legitimate webhooks even if we cannot use the
  // update. Telegram retries on any non-2xx, and we have nothing to gain
  // from making it retry an update we have already decided to ignore.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseStartCommand(body);
  if (!parsed) {
    return NextResponse.json({ ok: true });
  }

  try {
    await confirmNonce(parsed.nonce, parsed.telegramId, parsed.telegramUsername);
  } catch (err) {
    console.warn("[auth] telegram webhook confirm failed", err);
    // Returning 500 would make Telegram retry the same update endlessly.
    // The nonce TTL is short — the user will retry the deep-link instead.
  }

  return NextResponse.json({ ok: true });
}
