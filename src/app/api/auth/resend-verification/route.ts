import { NextResponse } from "next/server";
import {
  createVerificationTokenForEmail,
  getCurrentUser,
  isAuthSetupError,
} from "@/lib/auth";
import { buildVerificationEmail } from "@/lib/auth-email";
import { sendTransactionalEmail } from "@/lib/email";

export const runtime = "nodejs";

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
    if (isAuthSetupError(err)) {
      return NextResponse.json({ ok: false, error: "auth_not_configured" }, { status: 503 });
    }
    console.warn("[auth] resend verification failed", err);
    return NextResponse.json({ ok: false, error: "resend_failed" }, { status: 500 });
  }
}
