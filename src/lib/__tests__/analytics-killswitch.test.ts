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

  it("sheds all pageview writes when ANALYTICS_DISABLED=1", async () => {
    process.env.ANALYTICS_DISABLED = "1";
    await track({ name: "pageview", path: "/x" });
    // return-before-appendLog → no log line and no counters at all.
    expect(redis.store.lists.get(logKey()) ?? []).toHaveLength(0);
  });

  it("still records low-volume conversion events while pageviews are disabled", async () => {
    process.env.ANALYTICS_DISABLED = "1";
    await track({ name: "register_success", userId: "u1" });
    expect((redis.store.lists.get(logKey()) ?? []).length).toBe(1);
  });
});
