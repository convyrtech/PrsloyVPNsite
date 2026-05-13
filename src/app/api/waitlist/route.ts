import { NextResponse } from "next/server";

export const runtime = "nodejs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WaitlistBody = {
  email?: unknown;
  period?: unknown;
  payment?: unknown;
  locale?: unknown;
};

export async function POST(req: Request) {
  let body: WaitlistBody;
  try {
    body = (await req.json()) as WaitlistBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_REGEX.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 400 }
    );
  }

  const period = typeof body.period === "string" ? body.period : undefined;
  const payment = typeof body.payment === "string" ? body.payment : undefined;
  const locale = typeof body.locale === "string" ? body.locale : undefined;

  const ts = new Date().toISOString();
  const safe = JSON.stringify({ ts, email, period, payment, locale });

  // Always log — Vercel keeps these in deployment logs.
  console.log(`[waitlist] ${safe}`);

  // Optional: forward to Telegram if bot token + chat id are configured.
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (botToken && chatId) {
    try {
      const text =
        `New waitlist signup\n` +
        `email: ${email}\n` +
        (period ? `period: ${period}\n` : "") +
        (payment ? `payment: ${payment}\n` : "") +
        (locale ? `locale: ${locale}\n` : "") +
        `ts: ${ts}`;
      await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        cache: "no-store",
      });
    } catch (err) {
      console.warn("[waitlist] telegram notify failed", err);
    }
  }

  return NextResponse.json({ ok: true });
}
