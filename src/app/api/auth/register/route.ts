import { NextResponse, after } from "next/server";
import {
  AuthError,
  createSession,
  getAuthSetupErrorCode,
  issueVerificationToken,
  registerUserWithInvite,
  setSessionCookie,
} from "@/lib/auth";
import { buildVerificationEmail } from "@/lib/auth-email";
import { sendTransactionalEmail } from "@/lib/email";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { sanitizeKeyPart, track } from "@/lib/analytics";

export const runtime = "nodejs";

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_SECONDS = 3600;

type RegisterBody = {
  email?: unknown;
  password?: unknown;
  inviteCode?: unknown;
  locale?: unknown;
  utmSource?: unknown;
};

function getSiteUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

async function sendVerification(req: Request, email: string, userId: string, locale?: string) {
  const token = await issueVerificationToken(userId);
  const verifyUrl = `${getSiteUrl(req)}/api/auth/verify?token=${token}&locale=${locale || "en"}`;
  const message = buildVerificationEmail({ locale, verifyUrl });
  return await sendTransactionalEmail({
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
}

export async function POST(req: Request) {
  const limit = await rateLimit(
    "register",
    getClientIp(req),
    REGISTER_LIMIT,
    REGISTER_WINDOW_SECONDS
  );
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

  let body: RegisterBody;
  try {
    body = (await req.json()) as RegisterBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const inviteCode = typeof body.inviteCode === "string" ? body.inviteCode : "";
  const locale = typeof body.locale === "string" ? body.locale : "en";
  const rawUtm = typeof body.utmSource === "string" ? body.utmSource : "";
  const utmSource = rawUtm ? sanitizeKeyPart(rawUtm) || undefined : undefined;

  try {
    const user = await registerUserWithInvite(email, password, inviteCode);
    // registerUserWithInvite always sets email on success — narrow BEFORE
    // createSession so a (theoretically impossible) failure does not leak
    // an orphan session into KV.
    if (!user.email) throw new Error("register: email missing after register");
    const session = await createSession(user.id);
    const emailResult = await sendVerification(req, user.email, user.id, locale);

    after(() =>
      track({
        name: "register_success",
        userId: user.id,
        ...(utmSource ? { utmSource } : {}),
      })
    );

    const res = NextResponse.json({
      ok: true,
      user,
      verificationEmailSent: emailResult.ok,
    });
    setSessionCookie(res, session);
    return res;
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (err instanceof AuthError) {
      const status =
        err.code === "email_exists"
          ? 409
          : err.code === "invite_consumed"
            ? 409
            : err.code === "invite_invalid"
              ? 403
              : 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    console.warn("[auth] register failed", err);
    return NextResponse.json({ ok: false, error: "register_failed" }, { status: 500 });
  }
}
