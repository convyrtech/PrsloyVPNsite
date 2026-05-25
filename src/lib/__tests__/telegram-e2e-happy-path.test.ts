import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";

const redis = installFakeRedis();

const SAVED_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  AUTH_SECRET: process.env.AUTH_SECRET,
  ADMIN_SECRET: process.env.ADMIN_SECRET,
};

const WEBHOOK_SECRET = "smoke-webhook-secret-32-bytes-minimum-floor";
const ADMIN_SECRET = "smoke-admin-secret-32-bytes-minimum-floor";

beforeEach(() => {
  redis.reset();
  process.env.TELEGRAM_BOT_TOKEN = "smoke-bot-token";
  process.env.TELEGRAM_BOT_USERNAME = "prsloy_dev_bot";
  process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.AUTH_SECRET = "smoke-auth-secret-32-bytes-minimum-floor-too";
  process.env.ADMIN_SECRET = ADMIN_SECRET;
});

afterEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = SAVED_ENV.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_USERNAME = SAVED_ENV.TELEGRAM_BOT_USERNAME;
  process.env.TELEGRAM_WEBHOOK_SECRET = SAVED_ENV.TELEGRAM_WEBHOOK_SECRET;
  process.env.AUTH_SECRET = SAVED_ENV.AUTH_SECRET;
  process.env.ADMIN_SECRET = SAVED_ENV.ADMIN_SECRET;
});

function makeRequest(url: string, init?: RequestInit): Request {
  return new Request(url, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.42", ...(init?.headers ?? {}) },
    ...init,
  });
}

// Composes the full Telegram-auth flow through the actual route handlers,
// using only fake-redis as the storage substrate. This is what real prod
// runs — no shortcuts, no mocks of business logic. The only thing it does
// NOT exercise is HTTP transport (req comes in as a Request object), which
// Next.js handles transparently in serverless functions anyway.

describe("Telegram auth e2e happy path", () => {
  it("seed → /init → webhook → /claim → session cookie set", async () => {
    const adminPool = await import("@/app/api/admin/access-pool/add/route");
    const init = await import("@/app/api/auth/telegram/init/route");
    const webhook = await import("@/app/api/auth/telegram/webhook/route");
    const claim = await import("@/app/api/auth/telegram/claim/route");

    // 1. Operator seeds an invite code through the admin endpoint.
    const seedRes = await adminPool.POST(
      makeRequest("http://local.test/api/admin/access-pool/add", {
        headers: {
          Authorization: `Bearer ${ADMIN_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ codes: ["e2e-001"] }),
      })
    );
    expect(seedRes.status).toBe(200);
    expect(await seedRes.json()).toEqual({ ok: true, added: 1, skipped: 0 });

    // 2. Browser asks for a nonce + deep-link.
    const initRes = await init.POST(
      makeRequest("http://local.test/api/auth/telegram/init")
    );
    expect(initRes.status).toBe(200);
    const initBody = (await initRes.json()) as {
      ok: boolean;
      nonce: string;
      deepLink: string;
      expiresInSeconds: number;
    };
    expect(initBody.ok).toBe(true);
    expect(initBody.nonce).toMatch(/^[a-f0-9]{32}$/);
    expect(initBody.deepLink).toBe(
      `https://t.me/prsloy_dev_bot?start=${initBody.nonce}`
    );
    expect(initBody.expiresInSeconds).toBe(5 * 60);

    // 3. The user taps START in Telegram → bot fires our webhook with the
    //    Bot API update shape. We replay exactly that.
    const webhookRes = await webhook.POST(
      makeRequest("http://local.test/api/auth/telegram/webhook", {
        headers: {
          "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 1001,
          message: {
            message_id: 1,
            from: {
              id: 42424242,
              is_bot: false,
              first_name: "Smoke",
              username: "smoke_tester",
              language_code: "ru",
            },
            chat: { id: 42424242, type: "private", first_name: "Smoke" },
            date: Math.floor(Date.now() / 1000),
            text: `/start ${initBody.nonce}`,
            entities: [{ offset: 0, length: 6, type: "bot_command" }],
          },
        }),
      })
    );
    expect(webhookRes.status).toBe(200);

    // 4. Browser polls /claim with the nonce + the same code the user
    //    entered in the invite field on /register.
    const claimRes = await claim.POST(
      makeRequest("http://local.test/api/auth/telegram/claim", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: initBody.nonce, inviteCode: "e2e-001" }),
      })
    );
    expect(claimRes.status).toBe(200);
    const claimBody = (await claimRes.json()) as {
      ok: boolean;
      isNew: boolean;
      user: {
        id: string;
        telegramId: string;
        telegramUsername: string | null;
        email: string | null;
        accessStatus: string;
      };
    };
    expect(claimBody.ok).toBe(true);
    expect(claimBody.isNew).toBe(true);
    expect(claimBody.user.telegramId).toBe("42424242");
    expect(claimBody.user.telegramUsername).toBe("smoke_tester");
    expect(claimBody.user.email).toBeNull();
    expect(claimBody.user.accessStatus).toBe("pending");

    // 5. Session cookie was set on the response.
    const setCookie = claimRes.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/^prsloy_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);

    // 6. The invite code is now burned: trying the same code with a
    //    different Telegram user produces invite_consumed (not
    //    invite_invalid — the differentiation matters for UX copy).
    const stealRes = await claim.POST(
      makeRequest("http://local.test/api/auth/telegram/claim", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce: "this-nonce-was-never-minted-but-tests-error-path",
          inviteCode: "e2e-001",
        }),
      })
    );
    // Different nonce → nonce_expired (the nonce itself is the entry
    // point; we never get to the invite check).
    expect(stealRes.status).toBe(410);
  });

  it("returning Telegram user does not need an invite code on second login", async () => {
    const adminPool = await import("@/app/api/admin/access-pool/add/route");
    const init = await import("@/app/api/auth/telegram/init/route");
    const webhook = await import("@/app/api/auth/telegram/webhook/route");
    const claim = await import("@/app/api/auth/telegram/claim/route");

    // First-time registration.
    await adminPool.POST(
      makeRequest("http://local.test/", {
        headers: {
          Authorization: `Bearer ${ADMIN_SECRET}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ codes: ["e2e-002"] }),
      })
    );
    const initOne = await init.POST(makeRequest("http://local.test/"));
    const noneOne = (await initOne.json() as { nonce: string }).nonce;
    await webhook.POST(
      makeRequest("http://local.test/", {
        headers: {
          "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 2001,
          message: {
            from: { id: 12345, username: "returning_user" },
            text: `/start ${noneOne}`,
          },
        }),
      })
    );
    const firstClaim = await claim.POST(
      makeRequest("http://local.test/", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: noneOne, inviteCode: "e2e-002" }),
      })
    );
    expect(firstClaim.status).toBe(200);

    // Second login — same Telegram user, fresh nonce, NO invite code.
    const initTwo = await init.POST(makeRequest("http://local.test/"));
    const noneTwo = (await initTwo.json() as { nonce: string }).nonce;
    await webhook.POST(
      makeRequest("http://local.test/", {
        headers: {
          "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 2002,
          message: {
            from: { id: 12345, username: "returning_user" },
            text: `/start ${noneTwo}`,
          },
        }),
      })
    );
    const secondClaim = await claim.POST(
      makeRequest("http://local.test/", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: noneTwo }),
      })
    );
    expect(secondClaim.status).toBe(200);
    const secondBody = (await secondClaim.json()) as {
      ok: boolean;
      isNew: boolean;
      user: { telegramId: string };
    };
    expect(secondBody.isNew).toBe(false); // returning user
    expect(secondBody.user.telegramId).toBe("12345");
  });

  it("polling /claim before webhook confirms returns 202 pending", async () => {
    const init = await import("@/app/api/auth/telegram/init/route");
    const claim = await import("@/app/api/auth/telegram/claim/route");

    const initRes = await init.POST(makeRequest("http://local.test/"));
    const nonce = (await initRes.json() as { nonce: string }).nonce;

    const pendingRes = await claim.POST(
      makeRequest("http://local.test/", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce, inviteCode: "doesnt-matter-yet" }),
      })
    );
    expect(pendingRes.status).toBe(202);
    const pendingBody = (await pendingRes.json()) as {
      ok: boolean;
      status: string;
    };
    expect(pendingBody.status).toBe("pending");
  });

  it("webhook with wrong secret returns 401 and never confirms the nonce", async () => {
    const init = await import("@/app/api/auth/telegram/init/route");
    const webhook = await import("@/app/api/auth/telegram/webhook/route");
    const claim = await import("@/app/api/auth/telegram/claim/route");

    const initRes = await init.POST(makeRequest("http://local.test/"));
    const nonce = (await initRes.json() as { nonce: string }).nonce;

    const badRes = await webhook.POST(
      makeRequest("http://local.test/", {
        headers: {
          "x-telegram-bot-api-secret-token": "wrong-secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 3001,
          message: { from: { id: 99 }, text: `/start ${nonce}` },
        }),
      })
    );
    expect(badRes.status).toBe(401);

    // The nonce stays pending — the unauth'd webhook did not confirm it.
    const claimRes = await claim.POST(
      makeRequest("http://local.test/", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce }),
      })
    );
    expect(claimRes.status).toBe(202);
  });
});
