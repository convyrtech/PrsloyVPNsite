import { NextResponse } from "next/server";
import { generateInviteCode } from "@/lib/access-pool";
import { sendTransactionalEmail } from "@/lib/email";
import { buildInviteEmail } from "@/lib/invite-email";
import { isValidEmail } from "@/lib/validation";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Per-IP + per-email rate limits. Both apply: the IP guard stops a bot
// burning 10k codes from one machine, the email guard stops a friendly
// human flooding their own inbox by accident. Numbers tuned for the
// seed window — relax later when codes become scarcer.
const IP_LIMIT = 10;
const IP_WINDOW = 3600; // per hour
const EMAIL_LIMIT = 3;
const EMAIL_WINDOW = 86400; // per day

type Body = {
  email?: unknown;
  locale?: unknown;
};

function getSiteUrl(req: Request): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || new URL(req.url).origin
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const email =
    typeof body.email === "string"
      ? body.email.trim().toLowerCase()
      : "";
  if (!email || !isValidEmail(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 400 }
    );
  }

  // Two guards stacked. The IP guard fires first because abusive bursts
  // tend to come from a single source; the email guard catches typo-loops
  // and intentional self-spam.
  const ip = await rateLimit("invite-email-ip", getClientIp(req), IP_LIMIT, IP_WINDOW);
  if (!ip.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(ip.retryAfter) } }
    );
  }
  const perEmail = await rateLimit("invite-email", email, EMAIL_LIMIT, EMAIL_WINDOW);
  if (!perEmail.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(perEmail.retryAfter) } }
    );
  }

  let code: string;
  try {
    code = await generateInviteCode();
  } catch (err) {
    console.warn("[invite-email] code generation failed", err);
    return NextResponse.json(
      { ok: false, error: "code_generation_failed" },
      { status: 500 }
    );
  }

  const locale =
    typeof body.locale === "string" && body.locale.startsWith("en") ? "en" : "ru";
  const registerUrl = `${getSiteUrl(req)}/${locale}/register?code=${encodeURIComponent(code)}`;

  const message = buildInviteEmail({ code, registerUrl, locale });
  const sent = await sendTransactionalEmail({
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  if (!sent.ok) {
    console.warn("[invite-email] resend send failed", sent);
    return NextResponse.json(
      { ok: false, error: "email_send_failed" },
      { status: 502 }
    );
  }

  // Don't include the code in the response — keeping it email-only
  // preserves the "invite arrived in your inbox" artifact moment and
  // prevents trivial scraping by automated probes.
  return NextResponse.json({ ok: true });
}
