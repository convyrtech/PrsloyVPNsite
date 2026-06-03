import { createHmac } from "crypto";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { installFakeRedis } from "./fake-redis";

const redis = installFakeRedis();

const SECRET = "test-secret-32-bytes-of-rand-data-xx";
const URL = "https://hellcat.example.com";

let fetchSpy: MockInstance;

function mockResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function networkError(): Promise<Response> {
  return Promise.reject(new TypeError("fetch failed"));
}

function expectedSignature(payload: object): string {
  return createHmac("sha256", SECRET)
    .update(JSON.stringify(payload))
    .digest("hex");
}

beforeEach(() => {
  redis.reset();
  process.env.MARZNESHIN_PROXY_URL = URL;
  process.env.MARZNESHIN_PROXY_HMAC_SECRET = SECRET;
  delete process.env.MARZNESHIN_PROXY_TIMEOUT_MS;
  fetchSpy = vi.spyOn(globalThis, "fetch");
});

afterEach(() => {
  delete process.env.MARZNESHIN_PROXY_URL;
  delete process.env.MARZNESHIN_PROXY_HMAC_SECRET;
  delete process.env.MARZNESHIN_PROXY_TIMEOUT_MS;
  fetchSpy.mockRestore();
});

async function importModule() {
  vi.resetModules();
  return await import("@/lib/marzneshin-proxy");
}

describe("isMarzneshinProxyConfigured", () => {
  it("returns true when both env vars set", async () => {
    const m = await importModule();
    expect(m.isMarzneshinProxyConfigured()).toBe(true);
  });

  it("returns false when URL missing", async () => {
    delete process.env.MARZNESHIN_PROXY_URL;
    const m = await importModule();
    expect(m.isMarzneshinProxyConfigured()).toBe(false);
  });

  it("returns false when secret missing", async () => {
    delete process.env.MARZNESHIN_PROXY_HMAC_SECRET;
    const m = await importModule();
    expect(m.isMarzneshinProxyConfigured()).toBe(false);
  });
});

describe("issueKey — HMAC signature", () => {
  it("signs body with HMAC-SHA256 using configured secret", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        marz_username: "p_abc",
        subscription_url: "https://sub.example/p_abc/xyz",
      })
    );
    const m = await importModule();
    await m.issueKey({
      paymentId: "pay-1",
      periodDays: 30,
      userId: "user-1",
      email: "buyer@example.com",
    });

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    const expected = expectedSignature({
      payment_id: "pay-1",
      period_days: 30,
      prsloy_user_id: "user-1",
      email: "buyer@example.com",
    });
    expect(headers["X-PRSLOY-Signature"]).toBe(expected);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("posts to <url>/external/issue-key with trailing-slash-stripped base", async () => {
    process.env.MARZNESHIN_PROXY_URL = `${URL}//`;
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        marz_username: "p_x",
        subscription_url: "https://sub/x",
      })
    );
    const m = await importModule();
    await m.issueKey({
      paymentId: "p",
      periodDays: 30,
      userId: "u",
      email: "e@x",
    });
    const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(`${URL}/external/issue-key`);
  });
});

describe("issueKey — response handling", () => {
  it("returns marzUsername + subscriptionUrl on 200", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        marz_username: "p_abc",
        subscription_url: "https://sub.example/p_abc/xyz",
      })
    );
    const m = await importModule();
    const result = await m.issueKey({
      paymentId: "pay-1",
      periodDays: 30,
      userId: "u",
      email: "e@x",
    });
    expect(result).toEqual({
      marzUsername: "p_abc",
      subscriptionUrl: "https://sub.example/p_abc/xyz",
      idempotentReplay: false,
    });
  });

  it("treats 409 (idempotent replay) as success and flags it", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(409, {
        marz_username: "p_abc",
        subscription_url: "https://sub.example/p_abc/xyz",
      })
    );
    const m = await importModule();
    const result = await m.issueKey({
      paymentId: "pay-1",
      periodDays: 30,
      userId: "u",
      email: "e@x",
    });
    expect(result.idempotentReplay).toBe(true);
    expect(result.subscriptionUrl).toBe("https://sub.example/p_abc/xyz");
  });

  it("throws proxy_bad_signature on 401", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { error: "bad_sig" }));
    const m = await importModule();
    await expect(
      m.issueKey({ paymentId: "p", periodDays: 30, userId: "u", email: "e@x" })
    ).rejects.toMatchObject({
      name: "MarzneshinProxyError",
      code: "proxy_bad_signature",
    });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws proxy_bad_request on 400", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(400, { error: "bad_input" }));
    const m = await importModule();
    await expect(
      m.issueKey({ paymentId: "p", periodDays: 30, userId: "u", email: "e@x" })
    ).rejects.toMatchObject({ code: "proxy_bad_request" });
  });

  it("throws proxy_malformed_response when fields missing", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, { marz_username: "x" }));
    const m = await importModule();
    await expect(
      m.issueKey({ paymentId: "p", periodDays: 30, userId: "u", email: "e@x" })
    ).rejects.toMatchObject({ code: "proxy_malformed_response" });
  });

  it("throws proxy_malformed_response when subscription_url is not https", async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, {
        marz_username: "p_x",
        subscription_url: "http://127.0.0.1:8080/sub/x",
      })
    );
    const m = await importModule();
    await expect(
      m.issueKey({ paymentId: "p", periodDays: 30, userId: "u", email: "e@x" })
    ).rejects.toMatchObject({ code: "proxy_malformed_response" });
  });

  it("throws proxy_not_configured when env missing", async () => {
    delete process.env.MARZNESHIN_PROXY_URL;
    const m = await importModule();
    await expect(
      m.issueKey({ paymentId: "p", periodDays: 30, userId: "u", email: "e@x" })
    ).rejects.toMatchObject({ code: "proxy_not_configured" });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("issueKey — retry semantics", () => {
  it("retries once on 5xx and returns success on second attempt", async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(503, { error: "down" }))
      .mockResolvedValueOnce(
        mockResponse(200, {
          marz_username: "p_abc",
          subscription_url: "https://sub/p_abc/k",
        })
      );
    const m = await importModule();
    const result = await m.issueKey({
      paymentId: "p",
      periodDays: 30,
      userId: "u",
      email: "e@x",
    });
    expect(result.marzUsername).toBe("p_abc");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("retries once on network error", async () => {
    fetchSpy
      .mockImplementationOnce(networkError)
      .mockResolvedValueOnce(
        mockResponse(200, {
          marz_username: "p_x",
          subscription_url: "https://sub/x",
        })
      );
    const m = await importModule();
    const result = await m.issueKey({
      paymentId: "p",
      periodDays: 30,
      userId: "u",
      email: "e@x",
    });
    expect(result.marzUsername).toBe("p_x");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws proxy_upstream_failure when both attempts hit 5xx", async () => {
    fetchSpy
      .mockResolvedValueOnce(mockResponse(502, { error: "bad gateway" }))
      .mockResolvedValueOnce(mockResponse(502, { error: "bad gateway" }));
    const m = await importModule();
    await expect(
      m.issueKey({ paymentId: "p", periodDays: 30, userId: "u", email: "e@x" })
    ).rejects.toMatchObject({ code: "proxy_upstream_failure" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on 4xx (config error, not transient)", async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(401, { error: "bad" }));
    const m = await importModule();
    await expect(
      m.issueKey({ paymentId: "p", periodDays: 30, userId: "u", email: "e@x" })
    ).rejects.toMatchObject({ code: "proxy_bad_signature" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe("KV: saveSubscriptionRecord / getSubscriptionRecord", () => {
  it("round-trips a record", async () => {
    const m = await importModule();
    const record = {
      marzUsername: "p_abc",
      subscriptionUrl: "https://sub/p_abc/xyz",
      issuedAt: "2026-05-27T12:00:00.000Z",
      periodDays: 30,
      paymentId: "pay-1",
      source: "auto-issue" as const,
    };
    await m.saveSubscriptionRecord("user-1", record);
    const got = await m.getSubscriptionRecord("user-1");
    expect(got).toEqual(record);
  });

  it("returns null when nothing stored", async () => {
    const m = await importModule();
    expect(await m.getSubscriptionRecord("missing-user")).toBeNull();
  });

  it("returns null on corrupt JSON instead of throwing", async () => {
    redis.store.strings.set("marzneshin:user:user-1", "{not json");
    const m = await importModule();
    expect(await m.getSubscriptionRecord("user-1")).toBeNull();
  });
});

describe("periodToDays", () => {
  it("maps Period → calendar days", async () => {
    const m = await importModule();
    expect(m.periodToDays("1mo")).toBe(30);
    expect(m.periodToDays("6mo")).toBe(180);
    expect(m.periodToDays("1yr")).toBe(365);
  });
});

describe("getMarzneshinProxyErrorCode", () => {
  it("returns code for MarzneshinProxyError, null otherwise", async () => {
    const m = await importModule();
    fetchSpy.mockResolvedValueOnce(mockResponse(401, {}));
    try {
      await m.issueKey({
        paymentId: "p",
        periodDays: 30,
        userId: "u",
        email: "e@x",
      });
    } catch (err) {
      expect(m.getMarzneshinProxyErrorCode(err)).toBe("proxy_bad_signature");
    }
    expect(m.getMarzneshinProxyErrorCode(new Error("not us"))).toBeNull();
  });
});
