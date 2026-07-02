import { NextResponse } from "next/server";
import {
  confirmNonce,
  CONFIRM_PREFIX,
  DENY_PREFIX,
  isTelegramConfigured,
  parseBotMessage,
  sendTelegramAnswerCallback,
  sendTelegramMessage,
  validateWebhookSecret,
} from "@/lib/telegram-auth";

export const runtime = "nodejs";

// Telegram delivers updates via setWebhook to this URL. The endpoint is
// gated by the X-Telegram-Bot-Api-Secret-Token header set at setWebhook
// time. Without configuration the route is indistinguishable from a
// missing endpoint, so attackers cannot probe.
//
// Two command shapes are recognised (any other text is silently ignored,
// always returning 200 so Telegram doesn't retry):
//   /start <nonce>   → confirm the auth nonce (existing flow)
//   /start           → welcome message
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const parsed = parseBotMessage(body);
  if (!parsed) {
    return NextResponse.json({ ok: true });
  }

  try {
    if (parsed.kind === "start_with_nonce") {
      // SECURITY: a bare /start <nonce> tap must NOT confirm the login. A
      // relayed deep-link would otherwise let an attacker who called /init
      // log in as whoever taps the link (login-CSRF / account takeover).
      // Require an explicit, warned decision via inline buttons — the nonce
      // is only confirmed on the "confirm" callback below.
      await sendTelegramMessage(parsed.chatId, CONFIRM_PROMPT_TEXT, {
        parseMode: "HTML",
        replyMarkup: {
          inline_keyboard: [
            [
              {
                text: "✅ Подтвердить вход",
                callback_data: `${CONFIRM_PREFIX}${parsed.nonce}`,
              },
            ],
            [
              {
                text: "🚫 Это не я",
                callback_data: `${DENY_PREFIX}${parsed.nonce}`,
              },
            ],
          ],
        },
      });
    } else if (parsed.kind === "confirm_login") {
      // The user explicitly pressed "Подтвердить вход" — bind the nonce to
      // the telegramId that pressed the button (the consenting party).
      await confirmNonce(
        parsed.nonce,
        parsed.telegramId,
        parsed.telegramUsername
      );
      await sendTelegramAnswerCallback(
        parsed.callbackQueryId,
        "Вход подтверждён"
      );
      await sendTelegramMessage(parsed.chatId, SIGNED_IN_TEXT, {
        parseMode: "HTML",
      });
    } else if (parsed.kind === "deny_login") {
      await sendTelegramAnswerCallback(
        parsed.callbackQueryId,
        "Запрос отклонён"
      );
      await sendTelegramMessage(parsed.chatId, DENIED_TEXT, {
        parseMode: "HTML",
      });
    } else if (parsed.kind === "start_plain") {
      await sendTelegramMessage(parsed.chatId, WELCOME_TEXT, {
        parseMode: "HTML",
      });
    }
  } catch (err) {
    console.warn("[auth] telegram webhook handler failed", parsed.kind, err);
    // Don't propagate — Telegram retries on 5xx and we want noisy errors
    // to die here rather than loop forever against a broken handler.
  }

  return NextResponse.json({ ok: true });
}

const WELCOME_TEXT = `<b>PRSLOY</b>

Этот бот нужен для входа в аккаунт. На сайте prsloy.online нажми «Войти через Telegram» — бот пришлёт кнопку подтверждения.`;

const SIGNED_IN_TEXT = `<b>✓ ВХОД ПОДТВЕРЖДЁН</b>

Возвращайся на вкладку PRSLOY в браузере — ты уже внутри, заново входить не нужно.`;

const CONFIRM_PROMPT_TEXT = `<b>ПОДТВЕРДИ ВХОД В PRSLOY</b>

Кто-то открыл вход в аккаунт PRSLOY в браузере.

Это <b>ты</b> только что нажал «Войти через Telegram» на сайте? Тогда жми «Подтвердить вход».

<b>Если ты не открывал сайт</b> или ссылку прислал кто-то другой — жми «Это не я» и никому её не пересылай. Так в твой аккаунт пытается войти посторонний.`;

const DENIED_TEXT = `<b>ВХОД ОТКЛОНЁН</b>

Запрос на вход отклонён. Если это был не ты — всё в порядке, делать ничего не нужно.`;
