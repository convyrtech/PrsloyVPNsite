import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";

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
  // No RESEND_API_KEY → sendTransactionalEmail returns skipped without
  // touching fetch, which keeps the test hermetic.
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.VERCEL_ENV;
});

async function flushAfter() {
  while (afterQueue.length > 0) {
    const cb = afterQueue.shift()!;
    await cb();
  }
}

async function importRoute() {
  return await import("@/app/api/auth/register/route");
}

function registerReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

function registerEvents(): Array<Record<string, unknown>> {
  const date = new Date().toISOString().slice(0, 10);
  const log = redis.store.lists.get(`analytics:dev:log:${date}`) ?? [];
  return log
    .map((entry) => JSON.parse(entry) as Record<string, unknown>)
    .filter((event) => event.name === "register_success");
}

describe("POST /api/auth/register — analytics", () => {
  it("emits register_success with utmSource on successful registration", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      registerReq({
        email: "alice@example.com",
        password: "supersecret",
        locale: "ru",
        utmSource: "telegram",
      })
    );
    expect(res.status).toBe(200);
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
    const { POST } = await importRoute();
    await POST(
      registerReq({ email: "bob@example.com", password: "supersecret" })
    );
    await flushAfter();

    const events = registerEvents();
    expect(events).toHaveLength(1);
    expect(events[0].utmSource).toBeUndefined();
  });

  it("does NOT emit register_success on duplicate email", async () => {
    const { POST } = await importRoute();
    await POST(
      registerReq({ email: "claire@example.com", password: "supersecret" })
    );
    await flushAfter();

    expect(registerEvents()).toHaveLength(1);

    const res = await POST(
      registerReq({ email: "claire@example.com", password: "supersecret" })
    );
    expect(res.status).toBe(409);
    await flushAfter();

    expect(registerEvents()).toHaveLength(1);
  });

  it("does NOT emit register_success on invalid email", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      registerReq({ email: "not-an-email", password: "supersecret" })
    );
    expect(res.status).toBe(400);
    await flushAfter();

    expect(registerEvents()).toHaveLength(0);
  });

  it("does NOT emit register_success on rate-limit", async () => {
    const { POST } = await importRoute();
    // Fixed IP so all 5+1 calls hit the same bucket.
    function fixedIpReq(body: Record<string, unknown>): Request {
      return new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.99",
        },
        body: JSON.stringify(body),
      });
    }
    for (let i = 0; i < 5; i += 1) {
      await POST(fixedIpReq({ email: `u${i}@example.com`, password: "supersecret" }));
    }
    await flushAfter();
    const baseline = registerEvents().length;

    const res = await POST(
      fixedIpReq({ email: "spam@example.com", password: "supersecret" })
    );
    expect(res.status).toBe(429);
    await flushAfter();

    expect(registerEvents().length).toBe(baseline);
  });

  it("sanitizes utmSource via the analytics key sanitizer", async () => {
    const { POST } = await importRoute();
    await POST(
      registerReq({
        email: "doe@example.com",
        password: "supersecret",
        utmSource: "Telegram Ads",
      })
    );
    await flushAfter();

    const events = registerEvents();
    expect(events).toHaveLength(1);
    expect(events[0].utmSource).toBe("telegram_ads");
  });
});
