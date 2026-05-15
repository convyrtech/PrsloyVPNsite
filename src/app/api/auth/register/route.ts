import { NextResponse } from "next/server";
import {
  AuthError,
  createSession,
  issueVerificationToken,
  registerUser,
  SESSION_COOKIE,
  isAuthSetupError,
} from "@/lib/auth";
import { buildVerificationEmail } from "@/lib/auth-email";
import { sendTransactionalEmail } from "@/lib/email";

export const runtime = "nodejs";

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
    if (isAuthSetupError(err)) {
      return NextResponse.json({ ok: false, error: "auth_not_configured" }, { status: 503 });
    }
    if (err instanceof AuthError) {
      const status = err.code === "email_exists" ? 409 : 400;
      return NextResponse.json({ ok: false, error: err.code }, { status });
    }
    console.warn("[auth] register failed", err);
    return NextResponse.json({ ok: false, error: "register_failed" }, { status: 500 });
  }
}
