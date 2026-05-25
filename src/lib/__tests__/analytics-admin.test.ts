import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { track } from "@/lib/analytics";
import {
  readDailyAggregate,
  readRecentEvents,
} from "@/lib/analytics-admin";

const redis = installFakeRedis();

beforeEach(() => {
  redis.reset();
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
});

describe("readDailyAggregate", () => {
  it("returns an empty aggregate when nothing has been tracked", async () => {
    const agg = await readDailyAggregate("2026-05-24");
    expect(agg).toEqual({
      env: "dev",
      date: "2026-05-24",
      totalPageviews: 0,
      pageviews: [],
      utmSources: [],
      funnel: [],
      methods: [],
    });
  });

  it("aggregates pageviews, utm, funnel, and method counters for the day", async () => {
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "pageview", path: "/ru/pricing", utmSource: "telegram" });
    await track({ name: "register_success", userId: "u1", utmSource: "telegram" });
    await track({ name: "register_success", userId: "u2" });
    await track({ name: "payment_confirmed", orderId: "o1", amountRub: 500, utmSource: "telegram" });
    await track({ name: "payment_started", orderId: "o1", method: "sbp_qr", utmSource: "telegram" });
    await track({ name: "key_issued", userId: "u1" });

    const date = new Date().toISOString().slice(0, 10);
    const agg = await readDailyAggregate(date);

    expect(agg.totalPageviews).toBe(3);
    expect(agg.pageviews).toEqual([
      { label: "/ru", count: 2 },
      { label: "/ru/pricing", count: 1 },
    ]);
    expect(agg.utmSources).toEqual([
      { label: "direct", count: 2 },
      { label: "telegram", count: 1 },
    ]);

    // Funnel sorted by count desc — register has 2, payment + key_issued have 1
    expect(agg.funnel).toContainEqual({
      step: "register",
      source: "telegram",
      count: 1,
    });
    expect(agg.funnel).toContainEqual({
      step: "register",
      source: "direct",
      count: 1,
    });
    expect(agg.funnel).toContainEqual({
      step: "payment",
      source: "telegram",
      count: 1,
    });
    expect(agg.funnel).toContainEqual({
      step: "payment_started",
      source: "telegram",
      count: 1,
    });
    expect(agg.funnel).toContainEqual({
      step: "key",
      source: "_",
      count: 1,
    });

    expect(agg.methods).toEqual([{ label: "sbp_qr", count: 1 }]);
  });

  it("isolates aggregates by env prefix", async () => {
    process.env.VERCEL_ENV = "production";
    await track({ name: "pageview", path: "/ru" });

    delete process.env.VERCEL_ENV;
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "pageview", path: "/ru" });

    const date = new Date().toISOString().slice(0, 10);
    const prod = await readDailyAggregate(date, "prod");
    const dev = await readDailyAggregate(date, "dev");

    expect(prod.totalPageviews).toBe(1);
    expect(dev.totalPageviews).toBe(2);
  });

  it("ignores corrupt counter values", async () => {
    const date = new Date().toISOString().slice(0, 10);
    // Seed an index key + a bogus counter directly.
    redis.store.strings.set(`analytics:dev:pv:${date}:/bad`, "not-a-number");
    redis.store.sets.set(
      `analytics:dev:keys:${date}`,
      new Set([`analytics:dev:pv:${date}:/bad`])
    );

    const agg = await readDailyAggregate(date);
    expect(agg.totalPageviews).toBe(0);
    expect(agg.pageviews).toEqual([]);
  });

  it("skips keys it cannot parse", async () => {
    const date = new Date().toISOString().slice(0, 10);
    redis.store.strings.set("analytics:dev:weird", "1");
    redis.store.sets.set(
      `analytics:dev:keys:${date}`,
      new Set(["analytics:dev:weird"])
    );

    const agg = await readDailyAggregate(date);
    expect(agg.totalPageviews).toBe(0);
  });
});

describe("readRecentEvents", () => {
  it("returns the most recent events first", async () => {
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "register_success", userId: "u1" });
    await track({ name: "key_issued", userId: "u1" });

    const date = new Date().toISOString().slice(0, 10);
    const events = await readRecentEvents(date, 10);

    expect(events.length).toBe(3);
    // LPUSH means newest first.
    expect(events[0].name).toBe("key_issued");
    expect(events[1].name).toBe("register_success");
    expect(events[2].name).toBe("pageview");
  });

  it("returns [] when log key does not exist", async () => {
    const events = await readRecentEvents("2026-01-01", 50);
    expect(events).toEqual([]);
  });

  it("caps to the requested limit", async () => {
    for (let i = 0; i < 5; i += 1) {
      await track({ name: "pageview", path: `/ru/${i}` });
    }
    const date = new Date().toISOString().slice(0, 10);
    const events = await readRecentEvents(date, 2);
    expect(events.length).toBe(2);
  });
});
