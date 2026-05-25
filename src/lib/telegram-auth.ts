import { randomBytes, timingSafeEqual } from "crypto";
import { kvGet, kvSet } from "@/lib/kv";

/* Telegram bot deep-link auth state.
   ──────────────────────────────────
   The browser asks /init for a nonce, opens t.me/<bot>?start=<nonce>,
   the user taps "confirm" in the bot, Telegram POSTs the update to our
   webhook (validated by X-Telegram-Bot-Api-Secret-Token), the webhook
   marks the nonce confirmed, and the browser polling /claim consumes
   the nonce exactly once to mint a session.

   KV layout:
     tg-auth:nonce:<nonce>      JSON state, TTL 5 min
     tg-auth:claimed:<nonce>    "1", set NX on the winning /claim call,
                                TTL 1h so a late retry sees nonce_consumed
*/

const NONCE_LENGTH_BYTES = 16;
export const NONCE_TTL_SECONDS = 5 * 60;
const CLAIMED_TTL_SECONDS = 60 * 60;
const NONCE_PATTERN = /^[A-Za-z0-9_-]+$/;
// Floor for TELEGRAM_WEBHOOK_SECRET — README recommends ≥32 bytes for
// production. The code refuses to consider Telegram "configured" below
// this minimum so a stub like "test" cannot stand in for a real secret.
const MIN_WEBHOOK_SECRET_LENGTH = 22;

export type NonceState =
  | { status: "pending"; createdAt: string }
  | {
      status: "confirmed";
      telegramId: string;
      telegramUsername: string | null;
      confirmedAt: string;
    };

export type ClaimOutcome =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "consumed" }
  | {
      status: "ready";
      telegramId: string;
      telegramUsername: string | null;
    };

export class TelegramAuthError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "TelegramAuthError";
    this.code = code;
  }
}

function nonceKey(nonce: string): string {
  return `tg-auth:nonce:${nonce}`;
}

function confirmedKey(nonce: string): string {
  return `tg-auth:confirmed:${nonce}`;
}

function claimedKey(nonce: string): string {
  return `tg-auth:claimed:${nonce}`;
}

export function isTelegramConfigured(): boolean {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim() ?? "";
  return Boolean(
    process.env.TELEGRAM_BOT_TOKEN?.trim() &&
      process.env.TELEGRAM_BOT_USERNAME?.trim() &&
      secret.length >= MIN_WEBHOOK_SECRET_LENGTH
  );
}

function getWebhookSecret(): string | null {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || null;
}

function getBotUsername(): string {
  const raw = process.env.TELEGRAM_BOT_USERNAME?.trim();
  if (!raw) throw new TelegramAuthError("telegram_not_configured");
  return raw.replace(/^@/, "");
}

// Constant-time header comparison. Telegram includes the secret as a
// header on every webhook update (Bot API 6.4+). A missing or wrong
// header must be silently rejected — never tell the caller why.
export function validateWebhookSecret(req: Request): boolean {
  const header = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!header) return false;
  const expected = getWebhookSecret();
  if (!expected) return false;
  if (header.length !== expected.length) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return timingSafeEqual(a, b);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export type ParsedStart = {
  updateId: number;
  nonce: string;
  telegramId: string;
  telegramUsername: string | null;
};

// Extracts the `/start <nonce>` payload from a Telegram bot update.
// Returns null for anything that is not a private-chat /start with a
// well-formed nonce — callback queries, edited messages, photo posts,
// /start without an argument, all rejected.
export function parseStartCommand(update: unknown): ParsedStart | null {
  if (!isObject(update)) return null;
  const updateId =
    typeof update.update_id === "number" ? update.update_id : null;
  if (updateId === null) return null;

  const msg = isObject(update.message) ? update.message : null;
  if (!msg) return null;

  const text = typeof msg.text === "string" ? msg.text : "";
  const match = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)\s*$/);
  if (!match) return null;

  const from = isObject(msg.from) ? msg.from : null;
  if (!from) return null;

  const fromId =
    typeof from.id === "number"
      ? String(from.id)
      : typeof from.id === "string"
        ? from.id
        : null;
  if (!fromId) return null;

  const username =
    typeof from.username === "string" && from.username ? from.username : null;

  return {
    updateId,
    nonce: match[1],
    telegramId: fromId,
    telegramUsername: username,
  };
}

export async function mintNonce(): Promise<string> {
  const nonce = randomBytes(NONCE_LENGTH_BYTES).toString("hex");
  const state: NonceState = {
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await kvSet(nonceKey(nonce), JSON.stringify(state), { ex: NONCE_TTL_SECONDS });
  return nonce;
}

// Reads the union of the two keys that back a nonce. The confirmed key
// wins when present — it's the only writer's record of who claimed the
// pending nonce first (NX-protected in confirmNonce), so its existence
// implies the pending key is logically superseded even if it still
// sits there until TTL expires.
export async function getNonceState(nonce: string): Promise<NonceState | null> {
  if (!NONCE_PATTERN.test(nonce)) return null;
  const confirmedRaw = await kvGet(confirmedKey(nonce));
  if (confirmedRaw) {
    try {
      const parsed = JSON.parse(confirmedRaw) as {
        telegramId: string;
        telegramUsername: string | null;
        confirmedAt: string;
      };
      return {
        status: "confirmed",
        telegramId: parsed.telegramId,
        telegramUsername: parsed.telegramUsername,
        confirmedAt: parsed.confirmedAt,
      };
    } catch {
      return null;
    }
  }
  const pendingRaw = await kvGet(nonceKey(nonce));
  if (!pendingRaw) return null;
  try {
    return JSON.parse(pendingRaw) as NonceState;
  } catch {
    return null;
  }
}

// NX-write the confirmed payload. The first webhook for a given nonce
// wins atomically; later retries (Telegram resend on transient failure,
// or a different user tapping a leaked deep-link) all see the key
// already set and silently no-op. This is the fix for the read-then-
// write race that the previous single-key version had.
export async function confirmNonce(
  nonce: string,
  telegramId: string,
  telegramUsername: string | null
): Promise<void> {
  const payload = JSON.stringify({
    telegramId,
    telegramUsername,
    confirmedAt: new Date().toISOString(),
  });
  await kvSet(confirmedKey(nonce), payload, {
    nx: true,
    ex: NONCE_TTL_SECONDS,
  });
}

// Race-safe claim. Reads state, then NX-writes the claimed marker —
// exactly one concurrent caller wins. Returns ready+payload only to the
// winner; losers see "consumed".
export async function tryClaimNonce(nonce: string): Promise<ClaimOutcome> {
  const state = await getNonceState(nonce);
  if (!state) return { status: "expired" };
  if (state.status !== "confirmed") return { status: "pending" };

  const won = await kvSet(claimedKey(nonce), "1", {
    nx: true,
    ex: CLAIMED_TTL_SECONDS,
  });
  if (!won) return { status: "consumed" };

  return {
    status: "ready",
    telegramId: state.telegramId,
    telegramUsername: state.telegramUsername,
  };
}

export function buildDeepLink(nonce: string): string {
  return `https://t.me/${getBotUsername()}?start=${encodeURIComponent(nonce)}`;
}
