import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { track, todayKey } from "@/lib/analytics";

const redis = installFakeRedis();

beforeEach(() => {
  redis.reset();
});

afterEach(() => {
  delete process.env.ANALYTICS_DISABLED;
  delete process.env.VERCEL_ENV;
});

describe("analytics pageview kill-switch", () => {
  const logKey = () => `analytics:dev:log:${todayKey()}`;

  it("writes a pageview log entry by default", async () => {
    await track({ name: "pageview", path: "/x" });
    expect((redis.store.lists.get(logKey()) ?? []).length).toBe(1);
  });

  it("sheds the per-path counter + log but keeps the per-source visit counter when ANALYTICS_DISABLED=1", async () => {
    process.env.ANALYTICS_DISABLED = "1";
    await track({ name: "pageview", path: "/x" });
    const date = todayKey();
    // Heavy writes shed: no per-hit log line, no high-cardinality per-path counter.
    expect(redis.store.lists.get(logKey()) ?? []).toHaveLength(0);
    expect([...redis.store.strings.keys()].filter((k) => k.includes(":pv:"))).toHaveLength(0);
    // Denominator preserved: the single per-source visit counter still increments,
    // so cost-per-click / per-source conversion stays computable during the spike.
    expect(redis.store.strings.get(`analytics:dev:utm:${date}:direct`)).toBe("1");
  });

  it("still records low-volume conversion events while pageviews are disabled", async () => {
    process.env.ANALYTICS_DISABLED = "1";
    await track({ name: "register_success", userId: "u1" });
    expect((redis.store.lists.get(logKey()) ?? []).length).toBe(1);
  });
});
