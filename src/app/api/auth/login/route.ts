import { NextResponse } from "next/server";
import {
  AuthError,
  createSession,
  loginUser,
  SESSION_COOKIE,
  isAuthSetupError,
} from "@/lib/auth";

export const runtime = "nodejs";

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

function setSessionCookie(res: NextResponse, session: string) {
  res.cookies.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function POST(req: Request) {
  let body: LoginBody;
  try {
    body = (await req.json()) as LoginBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  try {
    const user = await loginUser(email, password);
    const session = await createSession(user.id);
    const res = NextResponse.json({ ok: true, user });
    setSessionCookie(res, session);
    return res;
  } catch (err) {
    if (isAuthSetupError(err)) {
      return NextResponse.json({ ok: false, error: "auth_not_configured" }, { status: 503 });
    }
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: 401 });
    }
    console.warn("[auth] login failed", err);
    return NextResponse.json({ ok: false, error: "login_failed" }, { status: 500 });
  }
}
