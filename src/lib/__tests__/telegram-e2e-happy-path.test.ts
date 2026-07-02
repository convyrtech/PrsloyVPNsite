import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";

// next/server's after() throws when called outside a Next.js request
// scope. The claim route uses it to fire analytics fire-and-forget; in
// tests we just capture the callback so the route's try/catch never sees
// the underlying "no request context" error.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (cb: () => Promise<void> | void) => {
      void Promise.resolve(cb()).catch(() => undefined);
    },
  };
});

const redis = installFakeRedis();

const SAVED_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  AUTH_SECRET: process.env.AUTH_SECRET,
};

const WEBHOOK_SECRET = "smoke-webhook-secret-32-bytes-minimum-floor";

beforeEach(() => {
  redis.reset();
  process.env.TELEGRAM_BOT_TOKEN = "smoke-bot-token";
  process.env.TELEGRAM_BOT_USERNAME = "prsloy_dev_bot";
  process.env.TELEGRAM_WEBHOOK_SECRET = WEBHOOK_SECRET;
  process.env.AUTH_SECRET = "smoke-auth-secret-32-bytes-minimum-floor-too";
});

afterEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = SAVED_ENV.TELEGRAM_BOT_TOKEN;
  process.env.TELEGRAM_BOT_USERNAME = SAVED_ENV.TELEGRAM_BOT_USERNAME;
  process.env.TELEGRAM_WEBHOOK_SECRET = SAVED_ENV.TELEGRAM_WEBHOOK_SECRET;
  process.env.AUTH_SECRET = SAVED_ENV.AUTH_SECRET;
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
  it("/init → webhook → /claim → session cookie set", async () => {
    const init = await import("@/app/api/auth/telegram/init/route");
    const webhook = await import("@/app/api/auth/telegram/webhook/route");
    const claim = await import("@/app/api/auth/telegram/claim/route");

    // 1. Browser asks for a nonce + deep-link.
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

    // 2. The user taps START in Telegram → bot fires our webhook with the
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

    // 2b. The bot replied with confirm/deny buttons; /start does NOT auto-
    //     confirm. The user presses "Подтвердить вход" → callback_query.
    const confirmRes = await webhook.POST(
      makeRequest("http://local.test/api/auth/telegram/webhook", {
        headers: {
          "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 1002,
          callback_query: {
            id: "cbq-1",
            from: { id: 42424242, username: "smoke_tester" },
            message: { chat: { id: 42424242, type: "private" } },
            data: `tgauth:confirm:${initBody.nonce}`,
          },
        }),
      })
    );
    expect(confirmRes.status).toBe(200);

    // 3. Browser polls /claim with the nonce — no invite code, registration
    //    is open.
    const claimRes = await claim.POST(
      makeRequest("http://local.test/api/auth/telegram/claim", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: initBody.nonce }),
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

    // 4. Session cookie was set on the response.
    const setCookie = claimRes.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
    expect(setCookie).toMatch(/^prsloy_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).toMatch(/Path=\//);
  });

  it("returning Telegram user gets signed in again on a second login", async () => {
    const init = await import("@/app/api/auth/telegram/init/route");
    const webhook = await import("@/app/api/auth/telegram/webhook/route");
    const claim = await import("@/app/api/auth/telegram/claim/route");

    // First-time registration.
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
    // Explicit confirm (the /start above only sent buttons).
    await webhook.POST(
      makeRequest("http://local.test/", {
        headers: {
          "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 2011,
          callback_query: {
            id: "cbq-2011",
            from: { id: 12345, username: "returning_user" },
            message: { chat: { id: 12345 } },
            data: `tgauth:confirm:${noneOne}`,
          },
        }),
      })
    );
    const firstClaim = await claim.POST(
      makeRequest("http://local.test/", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce: noneOne }),
      })
    );
    expect(firstClaim.status).toBe(200);

    // Second login — same Telegram user, fresh nonce.
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
    // Explicit confirm for the second login.
    await webhook.POST(
      makeRequest("http://local.test/", {
        headers: {
          "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 2012,
          callback_query: {
            id: "cbq-2012",
            from: { id: 12345, username: "returning_user" },
            message: { chat: { id: 12345 } },
            data: `tgauth:confirm:${noneTwo}`,
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
        body: JSON.stringify({ nonce }),
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

  it("security: a relayed /start does NOT confirm — only an explicit confirm callback does", async () => {
    const init = await import("@/app/api/auth/telegram/init/route");
    const webhook = await import("@/app/api/auth/telegram/webhook/route");
    const claim = await import("@/app/api/auth/telegram/claim/route");

    // Attacker initiates /init (holds the nonce). Then phishes a victim into
    // tapping the relayed deep link — that fires /start as the VICTIM.
    const initRes = await init.POST(makeRequest("http://local.test/"));
    const nonce = (await initRes.json() as { nonce: string }).nonce;

    await webhook.POST(
      makeRequest("http://local.test/", {
        headers: {
          "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 4001,
          message: {
            from: { id: 777, username: "victim" },
            text: `/start ${nonce}`,
          },
        }),
      })
    );

    // The attacker polls /claim — it must STAY pending, because /start only
    // sent buttons and nobody pressed "confirm". This is the relay defense.
    const afterStart = await claim.POST(
      makeRequest("http://local.test/", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce }),
      })
    );
    expect(afterStart.status).toBe(202);

    // Victim presses "Это не я" (deny) — nonce still never confirmed.
    await webhook.POST(
      makeRequest("http://local.test/", {
        headers: {
          "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          update_id: 4002,
          callback_query: {
            id: "cbq-4002",
            from: { id: 777, username: "victim" },
            message: { chat: { id: 777 } },
            data: `tgauth:deny:${nonce}`,
          },
        }),
      })
    );
    const afterDeny = await claim.POST(
      makeRequest("http://local.test/", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nonce }),
      })
    );
    expect(afterDeny.status).toBe(202);
  });

  it("webhook /start emits the confirm/deny inline keyboard (does not auto-confirm)", async () => {
    const init = await import("@/app/api/auth/telegram/init/route");
    const webhook = await import("@/app/api/auth/telegram/webhook/route");

    const initRes = await init.POST(makeRequest("http://local.test/"));
    const nonce = (await initRes.json() as { nonce: string }).nonce;

    // Capture outbound Telegram API calls so we can assert the /start reply
    // carries the confirm/deny buttons — the producer side of the contract
    // whose consumer side (parseCallbackQuery) is unit-tested separately.
    const calls: Array<{ url: string; body: Record<string, unknown> | null }> = [];
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: RequestInfo | URL, opts?: RequestInit) => {
        calls.push({
          url: String(input),
          body:
            typeof opts?.body === "string"
              ? (JSON.parse(opts.body) as Record<string, unknown>)
              : null,
        });
        return new Response("{}", { status: 200 });
      });

    try {
      await webhook.POST(
        makeRequest("http://local.test/", {
          headers: {
            "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            update_id: 5001,
            message: {
              from: { id: 888, username: "tapper" },
              text: `/start ${nonce}`,
            },
          }),
        })
      );
    } finally {
      fetchSpy.mockRestore();
    }

    const sendMessage = calls.find((c) => c.url.includes("/sendMessage"));
    expect(sendMessage).toBeTruthy();
    const replyMarkup = sendMessage!.body?.reply_markup as
      | { inline_keyboard?: Array<Array<{ callback_data?: string }>> }
      | undefined;
    const buttons = (replyMarkup?.inline_keyboard ?? [])
      .flat()
      .map((b) => b.callback_data);
    expect(buttons).toContain(`tgauth:confirm:${nonce}`);
    expect(buttons).toContain(`tgauth:deny:${nonce}`);
    // And critically: no confirmNonce was called (no api call confirms here).
    expect(calls.some((c) => c.url.includes("/answerCallbackQuery"))).toBe(false);
  });
});
