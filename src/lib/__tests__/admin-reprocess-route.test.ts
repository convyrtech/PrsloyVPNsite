import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { registerUser } from "@/lib/auth";
import { listAuditEntries } from "@/lib/admin-audit";
import {
  attachPaymentTransaction,
  createPaymentOrder,
  updatePaymentByTransaction,
} from "@/lib/payments";

// after() is mocked away — the reprocess success path schedules a
// payment_confirmed track via after(), which can't run outside the Next
// request runtime. We don't assert on it here.
vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: () => {} };
});

const redis = installFakeRedis();
const SECRET = "admin-reprocess-secret-1234567890";

beforeEach(() => {
  redis.reset();
  process.env.ADMIN_SECRET = SECRET;
  process.env.AUTH_SECRET = "x".repeat(32);
  // No MARZNESHIN proxy configured -> the confirm runs but auto-issue is
  // skipped, which is enough to exercise the reprocess wiring.
});

afterEach(() => {
  delete process.env.ADMIN_SECRET;
  delete process.env.AUTH_SECRET;
});

async function importRoute() {
  return await import("@/app/api/admin/reprocess/route");
}

function req(body: unknown, opts: { auth?: boolean } = {}): Request {
  const auth = opts.auth ?? true;
  return new Request("http://localhost/api/admin/reprocess", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { authorization: `Bearer ${SECRET}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function seedPendingOrder(email: string) {
  const user = await registerUser(email, "password123");
  const order = await createPaymentOrder({
    userId: user.id,
    email,
    period: "1mo",
    method: "sbp_qr",
    utmSource: null,
  });
  await attachPaymentTransaction({
    orderId: order.id,
    transactionId: `tx-${order.id}`,
    paymentUrl: "https://pay.example/x",
    providerStatus: "PENDING",
  });
  return { user, order };
}

describe("POST /api/admin/reprocess", () => {
  it("returns 404 when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const { POST } = await importRoute();
    expect((await POST(req({ email: "x@y.z" }, { auth: false }))).status).toBe(404);
  });

  it("returns 401 without a Bearer token", async () => {
    const { POST } = await importRoute();
    expect((await POST(req({ email: "x@y.z" }, { auth: false }))).status).toBe(401);
  });

  it("returns 404 when the user has no order", async () => {
    await registerUser("noorder@example.com", "password123");
    const { POST } = await importRoute();
    const res = await POST(req({ email: "noorder@example.com" }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("order_not_found");
  });

  it("confirms the latest order and reports confirmedNow once (idempotent)", async () => {
    await seedPendingOrder("pay@example.com");
    const { POST } = await importRoute();

    const r1 = await POST(req({ email: "pay@example.com" }));
    const d1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(d1.status).toBe("confirmed");
    expect(d1.confirmedNow).toBe(true);
    // No MARZNESHIN proxy configured in this describe, so reissue never
    // triggers -- the field is always present on the response, just false.
    expect(d1.reissued).toBe(false);

    // A second reprocess of an already-confirmed order is a no-op.
    const r2 = await POST(req({ email: "pay@example.com" }));
    const d2 = await r2.json();
    expect(d2.status).toBe("confirmed");
    expect(d2.confirmedNow).toBe(false);
    expect(d2.reissued).toBe(false);
  });
});

describe("POST /api/admin/reprocess — reissue recovery", () => {
  const MARZ_URL = "https://hellcat.example.com";
  const MARZ_SECRET = "test-marz-secret-32-bytes-of-data-x";
  let fetchSpy: MockInstance;
  let marzCalls: Array<{ url: string; init: RequestInit }>;
  let marzResponses: Response[];

  beforeEach(() => {
    process.env.MARZNESHIN_PROXY_URL = MARZ_URL;
    process.env.MARZNESHIN_PROXY_HMAC_SECRET = MARZ_SECRET;
    marzCalls = [];
    marzResponses = [];
    const original = globalThis.fetch;
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, init) => {
        const u = typeof url === "string" ? url : (url as URL).toString();
        if (u.includes("/external/issue-key")) {
          marzCalls.push({ url: u, init: init ?? {} });
          const resp = marzResponses.shift();
          if (!resp) throw new TypeError("fetch failed");
          return resp;
        }
        return original(url, init);
      });
  });

  afterEach(() => {
    delete process.env.MARZNESHIN_PROXY_URL;
    delete process.env.MARZNESHIN_PROXY_HMAC_SECRET;
    fetchSpy.mockRestore();
  });

  function queue502Pair() {
    marzResponses.push(new Response("err", { status: 502 }));
    marzResponses.push(new Response("err", { status: 502 }));
  }

  function queueProxy200(body: { marz_username: string; subscription_url: string }) {
    marzResponses.push(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  // Reproduces a paid-but-keyless order the same way production gets one:
  // the original CONFIRMED callback lands while the partner proxy is down,
  // so the order confirms (no rollback) but auto-issue fails and leaves
  // issueError set / no subscriptionUrl on the user.
  async function seedConfirmedKeylessOrder(email: string) {
    const user = await registerUser(email, "password123");
    const order = await createPaymentOrder({
      userId: user.id,
      email,
      period: "1mo",
      method: "sbp_qr",
      utmSource: null,
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: `tx-${order.id}`,
      paymentUrl: "https://pay.example/x",
      providerStatus: "PENDING",
    });
    queue502Pair();
    await updatePaymentByTransaction({
      transactionId: `tx-${order.id}`,
      providerStatus: "CONFIRMED",
    });
    return { user, order };
  }

  it("re-issues a confirmed-but-keyless order, then stops once the key is present", async () => {
    await seedConfirmedKeylessOrder("nokey@example.com");
    const { POST } = await importRoute();

    queueProxy200({
      marz_username: "p_nokey",
      subscription_url: "https://sub.example/p_nokey/x",
    });
    const r1 = await POST(req({ email: "nokey@example.com" }));
    const d1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(d1.reissued).toBe(true);
    expect(d1.reissueError).toBeUndefined();

    const { getUserByEmail } = await import("@/lib/auth");
    const updatedUser = await getUserByEmail("nokey@example.com");
    expect(updatedUser?.subscriptionUrl).toBe("https://sub.example/p_nokey/x");

    // Key is present now -- a follow-up reprocess must not re-issue again.
    const r2 = await POST(req({ email: "nokey@example.com" }));
    const d2 = await r2.json();
    expect(d2.reissued).toBe(false);
    expect(marzCalls).toHaveLength(3); // 2 (original failure) + 1 (successful reissue)
  });

  it("reports reissueError and an error audit entry when the re-issue attempt also fails", async () => {
    const { order } = await seedConfirmedKeylessOrder("stillnokey@example.com");
    const { POST } = await importRoute();

    queue502Pair();
    const res = await POST(req({ email: "stillnokey@example.com" }));
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.reissued).toBe(false);
    expect(data.reissueError).toBe("proxy_upstream_failure");

    const log = await listAuditEntries(10);
    expect(log[0]).toMatchObject({
      action: "reprocess",
      note: expect.stringContaining(`order ${order.id}`),
      result: "error",
    });
    expect(log[0].note).toContain("reissue_error=proxy_upstream_failure");
  });
});
