import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";

const redis = installFakeRedis();
const SECRET = "admin-issue-route-secret-1234567890";

beforeEach(() => {
  redis.reset();
  process.env.ADMIN_SECRET = SECRET;
});

afterEach(() => {
  delete process.env.ADMIN_SECRET;
});

async function importRoute() {
  return await import("@/app/api/admin/issue/route");
}

function req(body: unknown, opts: { auth?: boolean } = {}): Request {
  const auth = opts.auth ?? true;
  return new Request("http://localhost/api/admin/issue", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { authorization: `Bearer ${SECRET}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/issue — guards", () => {
  it("returns 404 when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const { POST } = await importRoute();
    expect((await POST(req({}, { auth: false }))).status).toBe(404);
  });

  it("returns 401 without a Bearer token", async () => {
    const { POST } = await importRoute();
    expect((await POST(req({}, { auth: false }))).status).toBe(401);
  });

  it("returns 429 only once the per-action limit is exceeded", async () => {
    const { POST } = await importRoute();
    // ISSUE_LIMIT = 20 / 60s. The first 20 authed calls pass the limiter
    // (400 invalid_email — the empty body never reaches the partner proxy)
    // and the 21st is the only 429. Asserting the boundary POSITION, not
    // just the tally.
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      statuses.push((await POST(req({}))).status);
    }
    expect(statuses.slice(0, 20).every((s) => s !== 429)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("does not count unauthorized requests toward the limit", async () => {
    const { POST } = await importRoute();
    for (let i = 0; i < 30; i += 1) {
      const res = await POST(req({ email: "x@y.z", period: "1mo" }, { auth: false }));
      expect(res.status).toBe(401);
    }
  });

  it("fails open: a KV outage never turns into a 429", async () => {
    redis.setFailing(true);
    const { POST } = await importRoute();
    // With KV down the limiter throws and is caught (request allowed), so
    // 30 authed calls (> ISSUE_LIMIT) all fall through to body validation
    // (400), never 429.
    for (let i = 0; i < 30; i += 1) {
      expect((await POST(req({}))).status).not.toBe(429);
    }
  });
});
