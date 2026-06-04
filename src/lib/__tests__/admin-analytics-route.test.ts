import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { todayKey, track } from "@/lib/analytics";

const redis = installFakeRedis();

beforeEach(() => {
  redis.reset();
  process.env.ADMIN_SECRET = "admin-test-secret-1234567890";
});

afterEach(() => {
  delete process.env.ADMIN_SECRET;
  delete process.env.VERCEL_ENV;
});

async function importRoute() {
  return await import("@/app/api/admin/analytics/route");
}

function makeReq(
  path: string,
  opts: { auth?: boolean } = {}
): Request {
  const auth = opts.auth ?? true;
  return new Request(`http://localhost${path}`, {
    method: "GET",
    headers: auth
      ? { authorization: `Bearer ${process.env.ADMIN_SECRET}` }
      : {},
  });
}

describe("GET /api/admin/analytics", () => {
  it("returns 404 when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const { GET } = await importRoute();
    const res = await GET(makeReq("/api/admin/analytics", { auth: false }));
    expect(res.status).toBe(404);
  });

  it("returns 401 without Bearer token", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeReq("/api/admin/analytics", { auth: false }));
    expect(res.status).toBe(401);
  });

  it("returns 401 with a wrong Bearer token", async () => {
    const { GET } = await importRoute();
    const req = new Request("http://localhost/api/admin/analytics", {
      method: "GET",
      headers: { authorization: "Bearer wrong-secret" },
    });
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns an empty aggregate for a fresh date", async () => {
    const { GET } = await importRoute();
    const res = await GET(makeReq("/api/admin/analytics?date=2026-01-01&env=dev"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.aggregate.totalPageviews).toBe(0);
    expect(data.aggregate.pageviews).toEqual([]);
  });

  it("returns the aggregate for the given env and date", async () => {
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "pageview", path: "/ru/pricing" });

    const date = todayKey();
    const { GET } = await importRoute();
    const res = await GET(
      makeReq(`/api/admin/analytics?date=${date}&env=dev`)
    );
    const data = await res.json();
    expect(data.aggregate.totalPageviews).toBe(3);
    expect(data.aggregate.pageviews).toEqual([
      { label: "/ru", count: 2 },
      { label: "/ru/pricing", count: 1 },
    ]);
  });

  it("defaults to today + prod when params are missing", async () => {
    process.env.VERCEL_ENV = "production";
    await track({ name: "pageview", path: "/ru" });

    const { GET } = await importRoute();
    const res = await GET(makeReq("/api/admin/analytics"));
    const data = await res.json();
    expect(data.aggregate.env).toBe("prod");
    expect(data.aggregate.totalPageviews).toBe(1);
  });

  it("falls back to today when date param is malformed", async () => {
    const { GET } = await importRoute();
    const res = await GET(
      makeReq("/api/admin/analytics?date=not-a-date&env=dev")
    );
    const data = await res.json();
    expect(data.aggregate.date).toBe(todayKey());
  });

  it("falls back to prod when env param is invalid", async () => {
    const { GET } = await importRoute();
    const res = await GET(
      makeReq("/api/admin/analytics?env=staging")
    );
    const data = await res.json();
    expect(data.aggregate.env).toBe("prod");
  });

  it("returns recent events when log=1 is set", async () => {
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "register_success", userId: "u1" });

    const date = todayKey();
    const { GET } = await importRoute();
    const res = await GET(
      makeReq(`/api/admin/analytics?date=${date}&env=dev&log=1`)
    );
    const data = await res.json();
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events.length).toBe(2);
    expect(data.events[0].name).toBe("register_success");
  });

  it("omits events when log param is not 1", async () => {
    await track({ name: "pageview", path: "/ru" });
    const date = todayKey();
    const { GET } = await importRoute();
    const res = await GET(
      makeReq(`/api/admin/analytics?date=${date}&env=dev`)
    );
    const data = await res.json();
    expect(data.events).toEqual([]);
  });
});
