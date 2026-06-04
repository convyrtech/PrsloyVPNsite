import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { todayKey } from "@/lib/analytics";
import { addInviteCodes } from "@/lib/access-pool";
import {
  confirmNonce,
  mintNonce,
} from "@/lib/telegram-auth";

const afterQueue: Array<() => Promise<void> | void> = [];
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: (cb: () => Promise<void> | void) => {
      afterQueue.push(cb);
    },
  };
});

const redis = installFakeRedis();

beforeEach(() => {
  redis.reset();
  afterQueue.length = 0;
  process.env.AUTH_SECRET = "x".repeat(32);
  process.env.TELEGRAM_BOT_TOKEN = "bot-token";
  process.env.TELEGRAM_BOT_USERNAME = "prsloy_bot";
  process.env.TELEGRAM_WEBHOOK_SECRET = "y".repeat(32);
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_USERNAME;
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  delete process.env.VERCEL_ENV;
});

async function flushAfter() {
  while (afterQueue.length > 0) {
    const cb = afterQueue.shift()!;
    await cb();
  }
}

async function importRoute() {
  return await import("@/app/api/auth/telegram/claim/route");
}

function claimReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/telegram/claim", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

function registerEvents(): Array<Record<string, unknown>> {
  const date = todayKey();
  const log = redis.store.lists.get(`analytics:dev:log:${date}`) ?? [];
  return log
    .map((entry) => JSON.parse(entry) as Record<string, unknown>)
    .filter((event) => event.name === "register_success");
}

async function setupConfirmedNonce(
  telegramId: string,
  telegramUsername: string | null
): Promise<string> {
  const nonce = await mintNonce();
  await confirmNonce(nonce, telegramId, telegramUsername);
  return nonce;
}

describe("POST /api/auth/telegram/claim — analytics", () => {
  it("emits register_success with utmSource on first-time registration (isNew=true)", async () => {
    await addInviteCodes(["INVITE-FIRST"]);
    const nonce = await setupConfirmedNonce("11111", "alice_tg");

    const { POST } = await importRoute();
    const res = await POST(
      claimReq({
        nonce,
        inviteCode: "INVITE-FIRST",
        utmSource: "telegram",
      })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isNew).toBe(true);
    await flushAfter();

    const events = registerEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "register_success",
      utmSource: "telegram",
    });
    expect(typeof events[0].userId).toBe("string");
  });

  it("emits register_success without utmSource when absent", async () => {
    await addInviteCodes(["INVITE-NOSRC"]);
    const nonce = await setupConfirmedNonce("22222", null);

    const { POST } = await importRoute();
    await POST(claimReq({ nonce, inviteCode: "INVITE-NOSRC" }));
    await flushAfter();

    const events = registerEvents();
    expect(events).toHaveLength(1);
    expect(events[0].utmSource).toBeUndefined();
  });

  it("does NOT emit register_success for a returning user (isNew=false)", async () => {
    // First registration burns one invite.
    await addInviteCodes(["INVITE-ONCE"]);
    const firstNonce = await setupConfirmedNonce("33333", "returning");
    const { POST } = await importRoute();
    await POST(claimReq({ nonce: firstNonce, inviteCode: "INVITE-ONCE" }));
    await flushAfter();
    expect(registerEvents()).toHaveLength(1);

    // Same Telegram id signs in again — no invite needed, isNew=false.
    const secondNonce = await setupConfirmedNonce("33333", "returning");
    const res = await POST(claimReq({ nonce: secondNonce }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.isNew).toBe(false);
    await flushAfter();

    // Counter unchanged — register_success should NOT fire again.
    expect(registerEvents()).toHaveLength(1);
  });

  it("does NOT emit register_success when invite is missing for a new user", async () => {
    const nonce = await setupConfirmedNonce("44444", null);
    const { POST } = await importRoute();
    const res = await POST(claimReq({ nonce }));
    expect(res.status).toBe(400);
    await flushAfter();
    expect(registerEvents()).toHaveLength(0);
  });

  it("does NOT emit register_success when the nonce is still pending", async () => {
    const nonce = await import("@/lib/telegram-auth").then((m) => m.mintNonce());
    // Nonce never confirmed by webhook — claim returns 202 pending.

    const { POST } = await importRoute();
    const res = await POST(claimReq({ nonce, inviteCode: "INV-PENDING" }));
    expect(res.status).toBe(202);
    await flushAfter();
    expect(registerEvents()).toHaveLength(0);
  });

  it("does NOT emit register_success when rate-limited (429)", async () => {
    // tg-claim is 60 / 120s per IP. We send 61 from the same IP from
    // a path that can't actually register (invalid nonce → 400) so we
    // don't burn invites in the loop, then assert the 61st is 429
    // AND that no register_success ever fired (the route never
    // reached loginOrRegisterByTelegram).
    function fixedIp(body: Record<string, unknown>): Request {
      return new Request("http://localhost/api/auth/telegram/claim", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.7",
        },
        body: JSON.stringify(body),
      });
    }
    const { POST } = await importRoute();
    for (let i = 0; i < 60; i += 1) {
      const res = await POST(fixedIp({ nonce: "bad-nonce!@" }));
      expect(res.status).toBe(400); // invalid_nonce, but rate-limit counted
    }
    await flushAfter();

    const res61 = await POST(fixedIp({ nonce: "bad-nonce!@" }));
    expect(res61.status).toBe(429);
    await flushAfter();
    expect(registerEvents()).toHaveLength(0);
  });

  it("sanitizes utmSource via the analytics key sanitizer", async () => {
    await addInviteCodes(["INVITE-SANIT"]);
    const nonce = await setupConfirmedNonce("55555", null);

    const { POST } = await importRoute();
    await POST(
      claimReq({
        nonce,
        inviteCode: "INVITE-SANIT",
        utmSource: "Telegram Ads",
      })
    );
    await flushAfter();

    const events = registerEvents();
    expect(events).toHaveLength(1);
    expect(events[0].utmSource).toBe("telegram_ads");
  });
});
