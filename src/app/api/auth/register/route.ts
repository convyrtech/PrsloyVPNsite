import { NextResponse } from "next/server";
import {
  AuthError,
  createSession,
  getAuthSetupErrorCode,
  issueVerificationToken,
  registerUser,
  SESSION_COOKIE,
} from "@/lib/auth";
import { buildVerificationEmail } from "@/lib/auth-email";
import { sendTransactionalEmail } from "@/lib/email";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const REGISTER_LIMIT = 5;
const REGISTER_WINDOW_SECONDS = 3600;

type RegisterBody = {
  email?: unknown;
  password?: unknown;
  locale?: unknown;
};

function getSiteUrl(req: Request) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    new URL(req.url).origin
  ).replace(/\/$/, "");
}

function setSessionCookie(res: NextResponse, session: string) {
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
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
  const locale = typeof body.locale === "string" ? body.locale : "en";

  try {
    const user = await registerUser(email, password);
    const session = await createSession(user.id);
    const emailResult = await sendVerification(req, user.email, user.id, locale);

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
      const status = err.code === "email_exists" ? 409 : 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    console.warn("[auth] register failed", err);
    return NextResponse.json({ ok: false, error: "register_failed" }, { status: 500 });
  }
}
