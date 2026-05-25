import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";

const redis = installFakeRedis();

const SAVED_ENV = {
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN,
  TELEGRAM_BOT_USERNAME: process.env.TELEGRAM_BOT_USERNAME,
  TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET,
  AUTH_SECRET: process.env.AUTH_SECRET,
};

beforeEach(() => {
  redis.reset();
  process.env.TELEGRAM_BOT_TOKEN = "test-bot-token";
  process.env.TELEGRAM_BOT_USERNAME = "prsloy_dev_bot";
  process.env.TELEGRAM_WEBHOOK_SECRET = "test-webhook-secret-with-enough-bytes";
  process.env.AUTH_SECRET = "test-auth-secret-value-at-least-32-characters";
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
    headers: { "x-forwarded-for": "203.0.113.7", ...(init?.headers ?? {}) },
    ...init,
  });
}

// These tests assert that each new auth endpoint is wrapped in a rate
// limiter — closes B15 from the plan-review test plan.

describe("POST /api/auth/telegram/init — rate limit", () => {
  it("returns 429 once the per-IP limit is exceeded", async () => {
    const { POST } = await import("@/app/api/auth/telegram/init/route");

    // INIT_LIMIT = 5 / 60s in the route. Six rapid calls from one IP
    // must produce one 429 — the rest are 200 with nonce/deepLink.
    const responses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await POST(makeRequest("http://test.local"));
      responses.push(res.status);
    }
    expect(responses.filter((s) => s === 429)).toHaveLength(1);
    expect(responses.filter((s) => s === 200)).toHaveLength(5);
  });
});

describe("POST /api/auth/telegram/claim — rate limit", () => {
  it("returns 429 once the per-IP limit is exceeded", async () => {
    const { POST } = await import("@/app/api/auth/telegram/claim/route");

    // CLAIM_LIMIT = 60 / 120s. We only assert the boundary — fire 61
    // calls with the same nonce shape, the 61st must be 429.
    let rateLimitedCount = 0;
    let preLimitCount = 0;
    for (let i = 0; i < 61; i += 1) {
      const res = await POST(
        makeRequest("http://test.local", {
          body: JSON.stringify({ nonce: "abc123xyz" }),
        })
      );
      if (res.status === 429) rateLimitedCount += 1;
      else preLimitCount += 1;
    }
    expect(rateLimitedCount).toBe(1);
    expect(preLimitCount).toBe(60);
  });
});

describe("POST /api/auth/telegram/webhook — secret-protected, no rate limit", () => {
  it("rejects unauthenticated requests with 401 regardless of frequency", async () => {
    const { POST } = await import("@/app/api/auth/telegram/webhook/route");

    // Webhook is intentionally not rate-limited (Telegram retries on 5xx;
    // 429 would loop forever). Defense is the secret-token header — every
    // request without it gets 401, never 429.
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(
        makeRequest("http://test.local", {
          body: JSON.stringify({ update_id: i }),
        })
      );
      expect(res.status).toBe(401);
    }
  });
});
