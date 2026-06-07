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
import { generateInviteCode } from "@/lib/access-pool";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Bot's per-user /invite rate limit. Default 5/day during the seed window
// (M1-2). Tighten via env later to make codes scarce ("invite-only" wedge
// kicks in once the funnel is primed).
const INVITE_LIMIT_PER_DAY =
  Number(process.env.TELEGRAM_INVITE_LIMIT_PER_DAY) || 5;
const INVITE_WINDOW_SECONDS = 86400;

function getSiteUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(req.url).origin
  ).replace(/\/$/, "");
}

// Telegram delivers updates via setWebhook to this URL. The endpoint is
// gated by the X-Telegram-Bot-Api-Secret-Token header set at setWebhook
// time. Without configuration the route is indistinguishable from a
// missing endpoint, so attackers cannot probe.
//
// Three command shapes are recognised (any other text is silently ignored,
// always returning 200 so Telegram doesn't retry):
//   /start <nonce>   → confirm the auth nonce (existing flow)
//   /start           → welcome message pointing at /invite
//   /invite          → generate a fresh code, DM with magic-link
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
    } else if (parsed.kind === "invite_request") {
      await handleInviteRequest(req, parsed.telegramId, parsed.chatId);
    }
  } catch (err) {
    console.warn("[auth] telegram webhook handler failed", parsed.kind, err);
    // Don't propagate — Telegram retries on 5xx and we want noisy errors
    // to die here rather than loop forever against a broken handler.
  }

  return NextResponse.json({ ok: true });
}

async function handleInviteRequest(
  req: Request,
  telegramId: string,
  chatId: string
): Promise<void> {
  const limit = await rateLimit(
    "tg-invite",
    telegramId,
    INVITE_LIMIT_PER_DAY,
    INVITE_WINDOW_SECONDS
  );
  if (!limit.ok) {
    const hours = Math.ceil(limit.retryAfter / 3600);
    await sendTelegramMessage(
      chatId,
      formatRateLimitedMessage(INVITE_LIMIT_PER_DAY, hours),
      { parseMode: "HTML" }
    );
    return;
  }

  const code = await generateInviteCode();
  const siteUrl = getSiteUrl(req);
  // The bot is Russian-facing; build the localized URL directly so the user
  // lands on /ru/register (localePrefix is "always" with an EN default, so a
  // bare /register would redirect a Russian invitee to the English page).
  const registerUrl = `${siteUrl}/ru/register?code=${encodeURIComponent(code)}`;

  await sendTelegramMessage(chatId, formatInviteMessage(code), {
    parseMode: "HTML",
    replyMarkup: {
      inline_keyboard: [
        [{ text: "ЗАРЕГИСТРИРОВАТЬСЯ →", url: registerUrl }],
      ],
    },
  });
}

const WELCOME_TEXT = `<b>PRSLOY · ЗАКРЫТАЯ БЕТА</b>

Чтобы получить место — отправь команду:

<code>/invite</code>

Подробнее: prsloy.online`;

const SIGNED_IN_TEXT = `<b>✓ ВХОД ПОДТВЕРЖДЁН</b>

Возвращайся на вкладку PRSLOY в браузере — ты уже внутри, заново входить не нужно.`;

const CONFIRM_PROMPT_TEXT = `<b>ПОДТВЕРДИ ВХОД В PRSLOY</b>

Кто-то открыл вход в аккаунт PRSLOY в браузере.

Это <b>ты</b> только что нажал «Войти через Telegram» на сайте? Тогда жми «Подтвердить вход».

<b>Если ты не открывал сайт</b> или ссылку прислал кто-то другой — жми «Это не я» и никому её не пересылай. Так в твой аккаунт пытается войти посторонний.`;

const DENIED_TEXT = `<b>ВХОД ОТКЛОНЁН</b>

Запрос на вход отклонён. Если это был не ты — всё в порядке, делать ничего не нужно.`;

function formatInviteMessage(code: string): string {
  return `<b>ТВОЁ ПРИГЛАШЕНИЕ В PRSLOY</b>

<code>${code}</code>

Код активен 24 часа. Жми кнопку ниже чтобы продолжить.`;
}

function formatRateLimitedMessage(limit: number, hours: number): string {
  return `<b>ЛИМИТ ПРИГЛАШЕНИЙ ИСЧЕРПАН</b>

В сутки можно получить ${limit} ${ruPlural(limit, "приглашение", "приглашения", "приглашений")}.
Попробуй через ${hours} ${ruPlural(hours, "час", "часа", "часов")}.`;
}

// Tiny i18n helper — Telegram messages need correct Russian plurals
// without dragging next-intl into a non-page surface.
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
