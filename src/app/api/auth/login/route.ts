import { NextResponse } from "next/server";
import {
  AuthError,
  createSession,
  getAuthSetupErrorCode,
  loginUser,
  setSessionCookie,
} from "@/lib/auth";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const LOGIN_LIMIT = 8;
const LOGIN_WINDOW_SECONDS = 300;

type LoginBody = {
  email?: unknown;
  password?: unknown;
};

export async function POST(req: Request) {
  const limit = await rateLimit("login", getClientIp(req), LOGIN_LIMIT, LOGIN_WINDOW_SECONDS, {
    failClosed: true,
  });
  if (!limit.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } }
    );
  }

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
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (err instanceof AuthError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: 401 });
    }
    console.warn("[auth] login failed", err);
    return NextResponse.json({ ok: false, error: "login_failed" }, { status: 500 });
  }
}
