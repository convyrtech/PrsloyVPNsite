import { NextResponse } from "next/server";
import { isValidEmail } from "@/lib/validation";
import { sendTransactionalEmail } from "@/lib/email";
import {
  buildWaitlistConfirmationEmail,
  buildWaitlistNotifyEmail,
} from "@/lib/waitlist-email";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 2048;

type WaitlistBody = {
  email?: unknown;
  period?: unknown;
  payment?: unknown;
  locale?: unknown;
};

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export async function POST(req: Request) {
  const contentLength = Number(req.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { ok: false, error: "body_too_large" },
      { status: 413 }
    );
  }

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
  if (!isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 400 }
    );
  }

  const period = str(body.period);
  const payment = str(body.payment);
  const locale = str(body.locale);

  const ts = new Date().toISOString();
  console.log(`[waitlist] ${JSON.stringify({ ts, email, period, payment, locale })}`);

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_NOTIFY_CHAT_ID;
  if (botToken && chatId) {
    const text =
      `New waitlist signup\n` +
      `email: ${email}\n` +
      (period ? `period: ${period}\n` : "") +
      (payment ? `payment: ${payment}\n` : "") +
      (locale ? `locale: ${locale}\n` : "") +
      `ts: ${ts}`;
    // Fire-and-forget: do not block the user's response on Telegram RTT.
    // keepalive lets the request survive the serverless function lifecycle.
    void fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      cache: "no-store",
      keepalive: true,
    }).catch((err) => console.warn("[waitlist] telegram notify failed", err));
  }

  const confirmationEmail = buildWaitlistConfirmationEmail({ email, period, payment, locale, ts });
  const emailResults = [
    sendTransactionalEmail({
      to: email,
      subject: confirmationEmail.subject,
      html: confirmationEmail.html,
      text: confirmationEmail.text,
    }),
  ];

  const notifyEmail = process.env.WAITLIST_NOTIFY_EMAIL?.trim().toLowerCase();
  if (notifyEmail && isValidEmail(notifyEmail)) {
    const adminEmail = buildWaitlistNotifyEmail({ email, period, payment, locale, ts });
    emailResults.push(
      sendTransactionalEmail({
        to: notifyEmail,
        subject: adminEmail.subject,
        html: adminEmail.html,
        text: adminEmail.text,
        replyTo: email,
      })
    );
  }

  for (const result of await Promise.all(emailResults)) {
    if (!result.ok && !result.skipped) {
      console.warn("[waitlist] email notify failed", result);
    }
  }

  return NextResponse.json({ ok: true });
}
