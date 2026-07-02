import { NextResponse } from "next/server";
import {
  AuthError,
  createVerificationTokenForEmail,
  getAuthSetupErrorCode,
  getCurrentUser,
  linkEmail,
} from "@/lib/auth";
import { buildVerificationEmail } from "@/lib/auth-email";
import { sendTransactionalEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const LINK_LIMIT = 5;
const LINK_WINDOW_SECONDS = 3600;

type LinkBody = {
  email?: unknown;
  locale?: unknown;
};

function getSiteUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  let body: LinkBody;
  try {
    body = (await req.json()) as LinkBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 }
    );
  }

  const email = typeof body.email === "string" ? body.email : "";
  const locale = typeof body.locale === "string" ? body.locale : "en";

  try {
    const current = await getCurrentUser();
    if (!current) {
      return NextResponse.json(
        { ok: false, error: "authentication_required" },
        { status: 401 }
      );
    }

    const limit = await rateLimit(
      "link-email",
      current.id,
      LINK_LIMIT,
      LINK_WINDOW_SECONDS
    );
    if (!limit.ok) {
      return NextResponse.json(
        { ok: false, error: "rate_limited" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
      );
    }

    const user = await linkEmail(current.id, email);

    // Best-effort: the email is already linked — a failed verification
    // send must not fail the linking (the user can resend from the ЛК).
    let verificationEmailSent = false;
    if (user.email) {
      try {
        const { token } = await createVerificationTokenForEmail(user.email);
        const verifyUrl = `${getSiteUrl(req)}/api/auth/verify?token=${token}&locale=${locale}`;
        const message = buildVerificationEmail({ locale, verifyUrl });
        const result = await sendTransactionalEmail({
          to: user.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
        });
        verificationEmailSent = result.ok;
      } catch (err) {
        console.warn("[auth] link-email verification send failed", err);
      }
    }

    return NextResponse.json({ ok: true, user, verificationEmailSent });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (err instanceof AuthError) {
      const status =
        err.code === "email_exists" || err.code === "email_already_set"
          ? 409
          : 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    console.warn("[auth] link-email failed", err);
    return NextResponse.json({ ok: false, error: "link_failed" }, { status: 500 });
  }
}
