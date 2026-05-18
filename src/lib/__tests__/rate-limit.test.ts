import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

const redis = installFakeRedis();

beforeEach(() => redis.reset());

describe("getClientIp", () => {
  it("uses the first x-forwarded-for entry", () => {
    const req = new Request("http://test.local", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(getClientIp(req)).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to 'unknown'", () => {
    const withReal = new Request("http://test.local", {
      headers: { "x-real-ip": "198.51.100.2" },
    });
    expect(getClientIp(withReal)).toBe("198.51.100.2");
    expect(getClientIp(new Request("http://test.local"))).toBe("unknown");
  });
});

describe("rateLimit", () => {
  it("allows requests up to the limit and blocks the one past it", async () => {
    const results = [];
    for (let i = 0; i < 4; i += 1) {
      results.push(await rateLimit("login", "ip-1", 3, 60));
    }
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
    expect(results[3].ok).toBe(false);
    expect(results[3].retryAfter).toBeGreaterThan(0);
  });

  it("keeps separate counters per identifier", async () => {
    await rateLimit("login", "ip-a", 1, 60);
    const other = await rateLimit("login", "ip-b", 1, 60);
    expect(other.ok).toBe(true);
  });

  it("fails open when the KV call errors", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    redis.setFailing(true);
    const result = await rateLimit("login", "ip-1", 1, 60);
    expect(result.ok).toBe(true);
    warn.mockRestore();
  });
});
