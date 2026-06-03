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
import { registerUser, getUserByEmail } from "@/lib/auth";
import { performAdminIssue } from "@/lib/admin-issue";
import { listAuditEntries } from "@/lib/admin-audit";

const redis = installFakeRedis();
const PROXY = "https://hellcat.example.com";
const PROXY_SECRET = "test-marz-secret-32-bytes-of-data-x";

// Pass-through wrapper: fake-redis stubbed fetch handles its own (KV) URLs;
// we hijack only requests to the marzneshin proxy endpoint.
let fetchSpy: MockInstance;
let marzResponses: Response[];

function queueProxy(status: number, body: unknown) {
  marzResponses.push(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })
  );
}

beforeEach(() => {
  redis.reset();
  process.env.AUTH_SECRET = "x".repeat(32);
  process.env.MARZNESHIN_PROXY_URL = PROXY;
  process.env.MARZNESHIN_PROXY_HMAC_SECRET = PROXY_SECRET;
  marzResponses = [];
  const original = globalThis.fetch;
  fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (url, init) => {
      const u = typeof url === "string" ? url : (url as URL).toString();
      if (u.includes("/external/issue-key")) {
        const resp = marzResponses.shift();
        if (!resp) throw new TypeError("fetch failed");
        return resp;
      }
      return original(url, init);
    });
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.MARZNESHIN_PROXY_URL;
  delete process.env.MARZNESHIN_PROXY_HMAC_SECRET;
  fetchSpy.mockRestore();
});

describe("performAdminIssue", () => {
  it("issues a key and flips the user active (comp)", async () => {
    await registerUser("comp@example.com", "supersecret");
    queueProxy(200, {
      marz_username: "p_x",
      subscription_url: "https://sub.example/p_x/k",
    });
    const r = await performAdminIssue({
      email: "comp@example.com",
      periodDays: 30,
      comp: true,
      note: "trial",
      reissueRequestId: null,
    });
    expect(r.action).toBe("issue");
    expect(r.subscriptionUrl).toBe("https://sub.example/p_x/k");
    expect(r.user.accessStatus).toBe("active");
    expect(r.user.subscriptionUrl).toBe("https://sub.example/p_x/k");
    const updated = await getUserByEmail("comp@example.com");
    expect(updated?.subscriptionUrl).toBe("https://sub.example/p_x/k");
  });

  it("reports action=extend when the user already holds a key", async () => {
    await registerUser("renew@example.com", "supersecret");
    queueProxy(200, {
      marz_username: "p_x",
      subscription_url: "https://sub.example/p_x/k",
    });
    queueProxy(200, {
      marz_username: "p_x",
      subscription_url: "https://sub.example/p_x/k",
    });
    await performAdminIssue({
      email: "renew@example.com",
      periodDays: 30,
      comp: false,
      note: null,
    });
    const second = await performAdminIssue({
      email: "renew@example.com",
      periodDays: 30,
      comp: false,
      note: null,
    });
    expect(second.action).toBe("extend");
  });

  it("writes a success audit entry with comp + note", async () => {
    await registerUser("audit@example.com", "supersecret");
    queueProxy(200, {
      marz_username: "p_a",
      subscription_url: "https://sub.example/p_a/k",
    });
    await performAdminIssue({
      email: "audit@example.com",
      periodDays: 7,
      comp: true,
      note: "7-day trial",
      reissueRequestId: null,
    });
    const log = await listAuditEntries(10);
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({
      action: "issue",
      comp: true,
      note: "7-day trial",
      periodDays: 7,
      result: "ok",
    });
  });

  it("throws user_not_found for an unknown email", async () => {
    await expect(
      performAdminIssue({
        email: "nope@example.com",
        periodDays: 30,
        comp: false,
        note: null,
      })
    ).rejects.toMatchObject({ code: "user_not_found" });
  });

  it("throws proxy_not_configured when the proxy env is missing", async () => {
    delete process.env.MARZNESHIN_PROXY_URL;
    await registerUser("x@example.com", "supersecret");
    await expect(
      performAdminIssue({
        email: "x@example.com",
        periodDays: 30,
        comp: false,
        note: null,
      })
    ).rejects.toMatchObject({ code: "proxy_not_configured" });
  });

  it("records an error audit entry and rethrows when the proxy rejects", async () => {
    await registerUser("fail@example.com", "supersecret");
    queueProxy(401, { error: "bad_sig" });
    await expect(
      performAdminIssue({
        email: "fail@example.com",
        periodDays: 30,
        comp: false,
        note: null,
      })
    ).rejects.toMatchObject({ code: "proxy_bad_signature" });
    const log = await listAuditEntries(10);
    expect(log[0]).toMatchObject({ action: "issue", result: "error" });
  });
});
