import { NextResponse } from "next/server";
import {
  createVerificationTokenForEmail,
  getAuthSetupErrorCode,
  getCurrentUser,
} from "@/lib/auth";
import { buildVerificationEmail } from "@/lib/auth-email";
import { sendTransactionalEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const RESEND_LIMIT = 4;
const RESEND_WINDOW_SECONDS = 3600;

type ResendBody = {
  locale?: unknown;
};

function getSiteUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  let body: ResendBody = {};
  try {
    body = (await req.json()) as ResendBody;
  } catch {
    body = {};
  }

  const locale = typeof body.locale === "string" ? body.locale : "en";

  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json({ ok: false, error: "authentication_required" }, { status: 401 });
    }
    if (current.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const limit = await rateLimit("resend", current.id, RESEND_LIMIT, RESEND_WINDOW_SECONDS);
    if (!limit.ok) {
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    const { token } = await createVerificationTokenForEmail(current.email);
    const verifyUrl = `${getSiteUrl(req)}/api/auth/verify?token=${token}&locale=${locale}`;
    const message = buildVerificationEmail({ locale, verifyUrl });
    const result = await sendTransactionalEmail({
      to: current.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    return NextResponse.json({ ok: result.ok, skipped: !result.ok && result.skipped });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[auth] resend verification failed", err);
    return NextResponse.json({ ok: false, error: "resend_failed" }, { status: 500 });
  }
}
