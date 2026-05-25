import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { registerUser } from "@/lib/auth";

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
  process.env.ADMIN_SECRET = "admin-test-secret-1234567890";
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.ADMIN_SECRET;
  delete process.env.VERCEL_ENV;
});

async function flushAfter() {
  while (afterQueue.length > 0) {
    const cb = afterQueue.shift()!;
    await cb();
  }
}

async function importRoute() {
  return await import("@/app/api/admin/grant/route");
}

function grantReq(body: Record<string, unknown>, opts: { auth?: boolean } = {}): Request {
  const auth = opts.auth ?? true;
  return new Request("http://localhost/api/admin/grant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(auth
        ? { authorization: `Bearer ${process.env.ADMIN_SECRET}` }
        : {}),
    },
    body: JSON.stringify(body),
  });
}

function keyIssuedEvents(): Array<Record<string, unknown>> {
  const date = new Date().toISOString().slice(0, 10);
  const log = redis.store.lists.get(`analytics:dev:log:${date}`) ?? [];
  return log
    .map((entry) => JSON.parse(entry) as Record<string, unknown>)
    .filter((event) => event.name === "key_issued");
}

describe("POST /api/admin/grant — analytics", () => {
  it("emits key_issued on successful grant", async () => {
    await registerUser("user1@example.com", "supersecret");
    const { POST } = await importRoute();

    const res = await POST(
      grantReq({
        email: "user1@example.com",
        subscriptionUrl: "https://vpn.example/sub/abc",
      })
    );
    expect(res.status).toBe(200);
    await flushAfter();

    const events = keyIssuedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "key_issued" });
    expect(typeof events[0].userId).toBe("string");
  });

  it("does NOT emit key_issued without auth", async () => {
    await registerUser("user2@example.com", "supersecret");
    const { POST } = await importRoute();

    const res = await POST(
      grantReq(
        {
          email: "user2@example.com",
          subscriptionUrl: "https://vpn.example/sub/abc",
        },
        { auth: false }
      )
    );
    expect(res.status).toBe(401);
    await flushAfter();

    expect(keyIssuedEvents()).toHaveLength(0);
  });

  it("does NOT emit key_issued when user does not exist", async () => {
    const { POST } = await importRoute();

    const res = await POST(
      grantReq({
        email: "ghost@example.com",
        subscriptionUrl: "https://vpn.example/sub/abc",
      })
    );
    expect(res.status).toBe(404);
    await flushAfter();

    expect(keyIssuedEvents()).toHaveLength(0);
  });

  it("does NOT emit key_issued on invalid subscription URL", async () => {
    await registerUser("user3@example.com", "supersecret");
    const { POST } = await importRoute();

    const res = await POST(
      grantReq({
        email: "user3@example.com",
        subscriptionUrl: "javascript:alert(1)",
      })
    );
    expect(res.status).toBe(400);
    await flushAfter();

    expect(keyIssuedEvents()).toHaveLength(0);
  });
});
