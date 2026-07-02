import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";

// route.ts calls getCurrentUser(), which reads the session cookie through
// next/headers cookies(); drive it through this jar like auth.test.ts does.
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieJar.value === undefined ? undefined : { value: cookieJar.value },
  }),
}));

import { createSession, loginOrRegisterByTelegram, registerUser } from "@/lib/auth";

const redis = installFakeRedis();

beforeEach(() => {
  redis.reset();
  cookieJar.value = undefined;
  process.env.AUTH_SECRET = "x".repeat(32);
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  vi.restoreAllMocks();
});

async function importRoute() {
  return await import("@/app/api/auth/link-email/route");
}

function linkReq(body: Record<string, unknown> | string): Request {
  return new Request("http://localhost/api/auth/link-email", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

// Registers a fresh Telegram-only user (no email yet) and signs it in by
// setting the mocked session cookie, mirroring auth.test.ts's "sessions"
// describe block.
async function loginAsNewTelegramUser(telegramId: string) {
  const { user } = await loginOrRegisterByTelegram({
    telegramId,
    telegramUsername: `tg${telegramId}`,
  });
  cookieJar.value = await createSession(user.id);
  return user;
}

// Lets the Resend send succeed without hitting the real API. fake-redis
// stubs global fetch for every call, so this wraps that stub: Resend-bound
// requests get a canned 200, everything else (KV) falls through untouched.
function mockResendSuccess() {
  process.env.RESEND_API_KEY = "test-key";
  process.env.RESEND_FROM = "no-reply@example.com";
  const original = globalThis.fetch;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (String(url).includes("api.resend.com")) {
      return new Response(JSON.stringify({ id: "email_123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return original(url as never, init);
  });
}

describe("POST /api/auth/link-email", () => {
  it("requires a session", async () => {
    const { POST } = await importRoute();
    const res = await POST(linkReq({ email: "someone@example.com" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("authentication_required");
  });

  it("rejects invalid JSON", async () => {
    await loginAsNewTelegramUser("100");
    const { POST } = await importRoute();
    const res = await POST(linkReq("{not valid json"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  it("links the email and reports verificationEmailSent when the send succeeds", async () => {
    await loginAsNewTelegramUser("101");
    mockResendSuccess();

    const { POST } = await importRoute();
    const res = await POST(linkReq({ email: "linked@example.com" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.user.email).toBe("linked@example.com");
    expect(json.user.emailVerified).toBe(false);
    expect(json.verificationEmailSent).toBe(true);
  });

  it("still links the email when the verification send fails (best-effort)", async () => {
    await loginAsNewTelegramUser("102");
    // No RESEND_API_KEY/RESEND_FROM -> sendTransactionalEmail returns
    // skipped without touching fetch, which keeps this hermetic.

    const { POST } = await importRoute();
    const res = await POST(linkReq({ email: "linked2@example.com" }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.user.email).toBe("linked2@example.com");
    expect(json.verificationEmailSent).toBe(false);
  });

  it("returns 409 when the email is already linked to another account", async () => {
    await registerUser("taken@example.com", "password123");
    await loginAsNewTelegramUser("103");

    const { POST } = await importRoute();
    const res = await POST(linkReq({ email: "taken@example.com" }));

    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email_exists");
  });

  it("returns 400 for an invalid email", async () => {
    await loginAsNewTelegramUser("104");

    const { POST } = await importRoute();
    const res = await POST(linkReq({ email: "not-an-email" }));

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_email");
  });

  it("returns 429 with Retry-After once the rate limit is exceeded", async () => {
    await loginAsNewTelegramUser("105");

    const { POST } = await importRoute();
    for (let i = 0; i < 5; i += 1) {
      await POST(linkReq({ email: `attempt${i}@example.com` }));
    }
    const res = await POST(linkReq({ email: "attempt5@example.com" }));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect((await res.json()).error).toBe("rate_limited");
  });
});
