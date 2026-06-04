import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { todayKey } from "@/lib/analytics";

// Capture all after() callbacks so the test can flush them and then
// assert on KV state. The real Next runtime delays execution past
// response; we just delay it past the assertion.
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
});

async function flushAfter() {
  while (afterQueue.length > 0) {
    const cb = afterQueue.shift()!;
    await cb();
  }
}

// rate-limit also writes to KV (rl:track:<ip>) — exclude those when
// asserting "nothing was tracked".
function analyticsKeys(): string[] {
  return [
    ...redis.store.strings.keys(),
    ...redis.store.sets.keys(),
    ...redis.store.lists.keys(),
  ].filter((k) => k.startsWith("analytics:"));
}

async function importRoute() {
  return await import("@/app/api/track/route");
}

function makeRequest(opts: {
  body?: unknown;
  headers?: Record<string, string>;
  bodyString?: string;
}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "sec-fetch-site": "same-origin",
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Safari/605.1.15",
    "x-forwarded-for": "203.0.113.5",
    ...(opts.headers ?? {}),
  };
  const body = opts.bodyString ?? JSON.stringify(opts.body ?? {});
  return new Request("http://localhost/api/track", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/track", () => {
  it("accepts a valid pageview and returns 204", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ body: { name: "pageview", path: "/ru" } }));
    expect(res.status).toBe(204);
    await flushAfter();
    const date = todayKey();
    expect(redis.store.strings.get(`analytics:dev:pv:${date}:/ru`)).toBe("1");
  });

  it("rejects bot user-agent silently with 204 and no KV write", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        body: { name: "pageview", path: "/ru" },
        headers: { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" },
      })
    );
    expect(res.status).toBe(204);
    await flushAfter();
    expect(analyticsKeys()).toEqual([]);
  });

  it("rejects cross-origin Sec-Fetch-Site with 204 and no write", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        body: { name: "pageview", path: "/ru" },
        headers: { "sec-fetch-site": "cross-site" },
      })
    );
    expect(res.status).toBe(204);
    await flushAfter();
    expect(analyticsKeys()).toEqual([]);
  });

  it("rejects malformed JSON with 204", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ bodyString: "not-json{" }));
    expect(res.status).toBe(204);
    await flushAfter();
    expect(analyticsKeys()).toEqual([]);
  });

  it("rejects non-pageview event names with 204", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({ body: { name: "register_success", userId: "u1" } })
    );
    expect(res.status).toBe(204);
    await flushAfter();
    expect(analyticsKeys()).toEqual([]);
  });

  it("rejects missing path with 204", async () => {
    const { POST } = await importRoute();
    const res = await POST(makeRequest({ body: { name: "pageview" } }));
    expect(res.status).toBe(204);
    await flushAfter();
    expect(analyticsKeys()).toEqual([]);
  });

  it("rejects oversized content-length with 204", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      makeRequest({
        body: { name: "pageview", path: "/ru" },
        headers: { "content-length": "20000" },
      })
    );
    expect(res.status).toBe(204);
    await flushAfter();
    expect(analyticsKeys()).toEqual([]);
  });

  it("rate-limits the same IP after 30 requests in the window", async () => {
    const { POST } = await importRoute();
    for (let i = 0; i < 30; i += 1) {
      const res = await POST(
        makeRequest({ body: { name: "pageview", path: `/ru/${i}` } })
      );
      expect(res.status).toBe(204);
    }
    await flushAfter();

    const res31 = await POST(
      makeRequest({ body: { name: "pageview", path: "/ru/31" } })
    );
    expect(res31.status).toBe(204);
    await flushAfter();

    const date = todayKey();
    expect(redis.store.strings.get(`analytics:dev:pv:${date}:/ru/31`)).toBeUndefined();
  });

  it("captures utmSource into the utm counter", async () => {
    const { POST } = await importRoute();
    await POST(
      makeRequest({
        body: { name: "pageview", path: "/ru", utmSource: "telegram" },
      })
    );
    await flushAfter();
    const date = todayKey();
    expect(redis.store.strings.get(`analytics:dev:utm:${date}:telegram`)).toBe("1");
  });

  it("sanitizes injected key characters in path before writing", async () => {
    const { POST } = await importRoute();
    await POST(
      makeRequest({
        body: { name: "pageview", path: "/ru?evil=*[wild]" },
      })
    );
    await flushAfter();
    // Path should never appear with raw '*' or '[' in the stored key.
    const keys = Array.from(redis.store.strings.keys());
    expect(keys.some((k) => k.includes("*") || k.includes("["))).toBe(false);
    expect(keys.some((k) => k.startsWith("analytics:dev:pv:"))).toBe(true);
  });
});
