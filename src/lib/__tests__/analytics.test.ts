import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import {
  envPrefix,
  isBotUA,
  parseUtm,
  sanitizeKeyPart,
  todayKey,
  track,
} from "@/lib/analytics";

const redis = installFakeRedis();

beforeEach(() => redis.reset());

afterEach(() => {
  delete process.env.VERCEL_ENV;
});

describe("todayKey", () => {
  it("buckets on Moscow time, not UTC", async () => {
    const { todayKey } = await import("@/lib/analytics");
    // 2026-05-25 21:00 UTC == 2026-05-26 00:00 MSK — first second of the
    // operator's "next day", but UTC is still on the 25th.
    expect(todayKey(new Date("2026-05-25T21:00:00.000Z"))).toBe("2026-05-26");
    // One minute earlier is still 2026-05-25 in Moscow.
    expect(todayKey(new Date("2026-05-25T20:59:00.000Z"))).toBe("2026-05-25");
  });
});

describe("envPrefix", () => {
  it("returns prod for VERCEL_ENV=production", () => {
    process.env.VERCEL_ENV = "production";
    expect(envPrefix()).toBe("prod");
  });

  it("returns preview for VERCEL_ENV=preview", () => {
    process.env.VERCEL_ENV = "preview";
    expect(envPrefix()).toBe("preview");
  });

  it("returns dev when VERCEL_ENV is unset", () => {
    expect(envPrefix()).toBe("dev");
  });

  it("returns dev for an unknown VERCEL_ENV value", () => {
    process.env.VERCEL_ENV = "weird";
    expect(envPrefix()).toBe("dev");
  });
});

describe("sanitizeKeyPart", () => {
  it("lowercases and trims", () => {
    expect(sanitizeKeyPart("  Telegram  ")).toBe("telegram");
  });

  it("replaces unsafe characters with underscore", () => {
    expect(sanitizeKeyPart("a:b*c?d[e]f\\g h")).toBe("a_b_c_d_e_f_g_h");
  });

  it("preserves a leading slash for paths", () => {
    expect(sanitizeKeyPart("/ru/pricing")).toBe("/ru/pricing");
  });

  it("caps length at 80", () => {
    const long = "x".repeat(200);
    expect(sanitizeKeyPart(long).length).toBe(80);
  });

  it("collapses script-injection-style input", () => {
    expect(sanitizeKeyPart("<script>alert(1)</script>")).toMatch(
      /^_*script_alert_1_*\/?script_*$/
    );
  });
});

describe("parseUtm", () => {
  it("reads utm_source/medium/campaign from a URL", () => {
    expect(parseUtm("https://prsloy.com/ru?utm_source=tg&utm_medium=ad&utm_campaign=launch"))
      .toEqual({ source: "tg", medium: "ad", campaign: "launch" });
  });

  it("reads from a bare query string", () => {
    expect(parseUtm("?utm_source=instagram")).toEqual({
      source: "instagram",
      medium: undefined,
      campaign: undefined,
    });
  });

  it("returns undefined for empty utm_source", () => {
    expect(parseUtm("https://prsloy.com/?utm_source=").source).toBeUndefined();
  });

  it("sanitizes utm values", () => {
    expect(parseUtm("?utm_source=Telegram%20Ads").source).toBe("telegram_ads");
  });

  it("returns undefined fields when none present", () => {
    expect(parseUtm("https://prsloy.com/")).toEqual({
      source: undefined,
      medium: undefined,
      campaign: undefined,
    });
  });
});

describe("isBotUA", () => {
  it("returns true for known bot UAs", () => {
    expect(isBotUA("Googlebot/2.1 (+http://www.google.com/bot.html)")).toBe(true);
  });

  it("returns true for missing UA", () => {
    expect(isBotUA(null)).toBe(true);
    expect(isBotUA(undefined)).toBe(true);
    expect(isBotUA("")).toBe(true);
  });

  it("returns false for a real browser UA", () => {
    expect(
      isBotUA(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15"
      )
    ).toBe(false);
  });
});

describe("track", () => {
  const date = todayKey();

  it("increments per-path pv counter and direct utm counter for pageview without utm", async () => {
    await track({ name: "pageview", path: "/ru" });
    expect(redis.store.strings.get(`analytics:dev:pv:${date}:/ru`)).toBe("1");
    expect(redis.store.strings.get(`analytics:dev:utm:${date}:direct`)).toBe("1");
  });

  it("increments utm counter under sanitized source for pageview with utm", async () => {
    await track({ name: "pageview", path: "/ru", utmSource: "Telegram Ads" });
    expect(redis.store.strings.get(`analytics:dev:utm:${date}:telegram_ads`)).toBe("1");
  });

  it("indexes each new key into per-date keys set", async () => {
    await track({ name: "pageview", path: "/ru" });
    const index = redis.store.sets.get(`analytics:dev:keys:${date}`);
    expect(index).toBeTruthy();
    expect(index!.has(`analytics:dev:pv:${date}:/ru`)).toBe(true);
    expect(index!.has(`analytics:dev:utm:${date}:direct`)).toBe(true);
  });

  it("appends to the per-date event log", async () => {
    await track({ name: "register_success", userId: "u1", utmSource: "tg" });
    const log = redis.store.lists.get(`analytics:dev:log:${date}`);
    expect(log).toBeTruthy();
    expect(log!.length).toBe(1);
    const parsed = JSON.parse(log![0]);
    expect(parsed.name).toBe("register_success");
    expect(parsed.userId).toBe("u1");
    expect(parsed.utmSource).toBe("tg");
    expect(typeof parsed.ts).toBe("string");
  });

  it("records register_success under funnel:register:<source>", async () => {
    await track({ name: "register_success", userId: "u1", utmSource: "instagram" });
    expect(redis.store.strings.get(`analytics:dev:funnel:${date}:register:instagram`)).toBe("1");
  });

  it("records register_success under funnel:register:direct when utm absent", async () => {
    await track({ name: "register_success", userId: "u1" });
    expect(redis.store.strings.get(`analytics:dev:funnel:${date}:register:direct`)).toBe("1");
  });

  it("records payment_confirmed under funnel:payment:<source>", async () => {
    await track({
      name: "payment_confirmed",
      orderId: "o1",
      amountRub: 500,
      utmSource: "tg",
    });
    expect(redis.store.strings.get(`analytics:dev:funnel:${date}:payment:tg`)).toBe("1");
  });

  it("accumulates revenue total AND per-source on payment_confirmed", async () => {
    await track({
      name: "payment_confirmed",
      orderId: "o1",
      amountRub: 500,
      utmSource: "tg",
    });
    await track({
      name: "payment_confirmed",
      orderId: "o2",
      amountRub: 2400,
      utmSource: "tg",
    });
    await track({
      name: "payment_confirmed",
      orderId: "o3",
      amountRub: 500,
    });
    expect(redis.store.strings.get(`analytics:dev:revenue_total:${date}`)).toBe("3400");
    expect(redis.store.strings.get(`analytics:dev:revenue:${date}:tg`)).toBe("2900");
    expect(redis.store.strings.get(`analytics:dev:revenue:${date}:direct`)).toBe("500");
  });

  it("does NOT let utm_source=_total collide with the day-total bucket", async () => {
    // The reserved total lives at analytics:env:revenue_total:date (no
    // source segment), so a user-supplied utm_source of "_total" lands
    // in a completely different key and shows up as its own per-source
    // entry instead of corrupting the total.
    await track({
      name: "payment_confirmed",
      orderId: "o-collide",
      amountRub: 500,
      utmSource: "_total",
    });
    expect(redis.store.strings.get(`analytics:dev:revenue_total:${date}`)).toBe("500");
    expect(redis.store.strings.get(`analytics:dev:revenue:${date}:_total`)).toBe("500");
  });

  it("skips revenue write for zero or negative amounts", async () => {
    await track({
      name: "payment_confirmed",
      orderId: "o-bad",
      amountRub: 0,
    });
    expect(redis.store.strings.get(`analytics:dev:revenue_total:${date}`)).toBeUndefined();
    // The funnel counter still bumps because the event itself happened.
    expect(redis.store.strings.get(`analytics:dev:funnel:${date}:payment:direct`)).toBe("1");
  });

  it("counts payment_started under funnel:payment_started AND method counter", async () => {
    await track({
      name: "payment_started",
      orderId: "o1",
      method: "sbp_qr",
      utmSource: "tg",
    });
    expect(redis.store.strings.get(`analytics:dev:funnel:${date}:payment_started:tg`)).toBe("1");
    expect(redis.store.strings.get(`analytics:dev:method:${date}:sbp_qr`)).toBe("1");
  });

  it("records key_issued under funnel:key:_", async () => {
    await track({ name: "key_issued", userId: "u1" });
    expect(redis.store.strings.get(`analytics:dev:funnel:${date}:key:_`)).toBe("1");
  });

  it("namespaces counters by env when VERCEL_ENV=production", async () => {
    process.env.VERCEL_ENV = "production";
    await track({ name: "pageview", path: "/ru" });
    expect(redis.store.strings.get(`analytics:prod:pv:${date}:/ru`)).toBe("1");
    expect(redis.store.strings.get(`analytics:dev:pv:${date}:/ru`)).toBeUndefined();
  });

  it("never throws on KV failure", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    redis.setFailing(true);
    await expect(
      track({ name: "pageview", path: "/ru" })
    ).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("accumulates counts across repeated calls", async () => {
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "pageview", path: "/ru" });
    await track({ name: "pageview", path: "/ru" });
    expect(redis.store.strings.get(`analytics:dev:pv:${date}:/ru`)).toBe("3");
  });
});
