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
// Inline-button callback_data prefixes for the explicit login confirmation
// step. Kept short to stay under Telegram's 64-byte callback_data limit
// (prefix + 32-hex nonce). Shared by the parser and the webhook builder so
// they never drift.
export const CONFIRM_PREFIX = "tgauth:confirm:";
export const DENY_PREFIX = "tgauth:deny:";

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

// Discriminated union of every bot message type the webhook handles.
// Anything that doesn't match one of these — callback queries, edited
// messages, photo posts, unknown text — falls through to null and the
// webhook silently 200s back to Telegram.
export type ParsedBotMessage =
  | {
      kind: "start_with_nonce";
      updateId: number;
      nonce: string;
      telegramId: string;
      telegramUsername: string | null;
      chatId: string;
    }
  | {
      kind: "start_plain";
      updateId: number;
      telegramId: string;
      telegramUsername: string | null;
      chatId: string;
    }
  | {
      kind: "invite_request";
      updateId: number;
      telegramId: string;
      telegramUsername: string | null;
      chatId: string;
    }
  | {
      kind: "confirm_login";
      updateId: number;
      nonce: string;
      telegramId: string;
      telegramUsername: string | null;
      chatId: string;
      callbackQueryId: string;
    }
  | {
      kind: "deny_login";
      updateId: number;
      nonce: string;
      telegramId: string;
      telegramUsername: string | null;
      chatId: string;
      callbackQueryId: string;
    };

export function parseBotMessage(update: unknown): ParsedBotMessage | null {
  if (!isObject(update)) return null;
  const updateId =
    typeof update.update_id === "number" ? update.update_id : null;
  if (updateId === null) return null;

  // Inline-button presses arrive as callback_query updates, not messages.
  // They carry the explicit login confirm/deny decision.
  const callback = isObject(update.callback_query) ? update.callback_query : null;
  if (callback) return parseCallbackQuery(updateId, callback);

  const msg = isObject(update.message) ? update.message : null;
  if (!msg) return null;

  const from = isObject(msg.from) ? msg.from : null;
  if (!from) return null;
  const fromId =
    typeof from.id === "number"
      ? String(from.id)
      : typeof from.id === "string"
        ? from.id
        : null;
  if (!fromId) return null;

  const chat = isObject(msg.chat) ? msg.chat : null;
  const chatId =
    chat && typeof chat.id === "number"
      ? String(chat.id)
      : chat && typeof chat.id === "string"
        ? chat.id
        : fromId; // private chat: chat.id === from.id

  const username =
    typeof from.username === "string" && from.username ? from.username : null;
  const text = typeof msg.text === "string" ? msg.text.trim() : "";

  const startWithNonce = text.match(
    /^\/start(?:@\w+)?\s+([A-Za-z0-9_-]+)\s*$/
  );
  if (startWithNonce) {
    return {
      kind: "start_with_nonce",
      updateId,
      nonce: startWithNonce[1],
      telegramId: fromId,
      telegramUsername: username,
      chatId,
    };
  }

  if (/^\/start(@\w+)?\s*$/.test(text)) {
    return {
      kind: "start_plain",
      updateId,
      telegramId: fromId,
      telegramUsername: username,
      chatId,
    };
  }

  if (/^\/invite(@\w+)?\s*$/.test(text)) {
    return {
      kind: "invite_request",
      updateId,
      telegramId: fromId,
      telegramUsername: username,
      chatId,
    };
  }

  return null;
}

function parseCallbackQuery(
  updateId: number,
  callback: Record<string, unknown>
): ParsedBotMessage | null {
  const id = typeof callback.id === "string" ? callback.id : null;
  if (!id) return null;

  const from = isObject(callback.from) ? callback.from : null;
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

  const message = isObject(callback.message) ? callback.message : null;
  const chat = message && isObject(message.chat) ? message.chat : null;
  const chatId =
    chat && typeof chat.id === "number"
      ? String(chat.id)
      : chat && typeof chat.id === "string"
        ? chat.id
        : fromId;

  const data = typeof callback.data === "string" ? callback.data : "";
  const isConfirm = data.startsWith(CONFIRM_PREFIX);
  const isDeny = data.startsWith(DENY_PREFIX);
  if (!isConfirm && !isDeny) return null;

  const nonce = data.slice((isConfirm ? CONFIRM_PREFIX : DENY_PREFIX).length);
  if (!NONCE_PATTERN.test(nonce)) return null;

  return {
    kind: isConfirm ? "confirm_login" : "deny_login",
    updateId,
    nonce,
    telegramId: fromId,
    telegramUsername: username,
    chatId,
    callbackQueryId: id,
  };
}

// Backwards-compatible wrapper that only returns nonce-bearing /start.
// New code paths use parseBotMessage and dispatch on .kind. Keeping
// this thin shim lets the existing webhook tests and consumers stay
// untouched.
export function parseStartCommand(update: unknown): ParsedStart | null {
  const parsed = parseBotMessage(update);
  if (parsed?.kind !== "start_with_nonce") return null;
  return {
    updateId: parsed.updateId,
    nonce: parsed.nonce,
    telegramId: parsed.telegramId,
    telegramUsername: parsed.telegramUsername,
  };
}

// Bot API base URL, lazily resolved so missing-config errors surface at
// call time rather than module load. Same pattern as getBotUsername.
function getBotApiBase(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) throw new TelegramAuthError("telegram_not_configured");
  return `https://api.telegram.org/bot${token}`;
}

// Sends a text message back to a Telegram chat. Used by the webhook to
// reply to /start (welcome) and /invite (issued code). Network or API
// failures are non-fatal — we log and return false so the caller can
// decide whether to retry, but never propagate; we already 200'd the
// webhook by the time this runs.
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  opts: {
    parseMode?: "HTML" | "MarkdownV2";
    replyMarkup?: Record<string, unknown>;
  } = {}
): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    };
    if (opts.parseMode) payload.parse_mode = opts.parseMode;
    if (opts.replyMarkup) payload.reply_markup = opts.replyMarkup;

    const res = await fetch(`${getBotApiBase()}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.warn(
        "[telegram] sendMessage non-2xx",
        res.status,
        detail.slice(0, 200)
      );
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[telegram] sendMessage threw", err);
    return false;
  }
}

// Acknowledges an inline-button press. Telegram shows the user a brief
// toast (the optional text) and stops the button's loading spinner. Like
// sendTelegramMessage, failures are non-fatal — we've already 200'd the
// webhook by the time this runs.
export async function sendTelegramAnswerCallback(
  callbackQueryId: string,
  text?: string
): Promise<boolean> {
  try {
    const payload: Record<string, unknown> = {
      callback_query_id: callbackQueryId,
    };
    if (text) payload.text = text;
    const res = await fetch(`${getBotApiBase()}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn("[telegram] answerCallbackQuery non-2xx", res.status);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[telegram] answerCallbackQuery threw", err);
    return false;
  }
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
