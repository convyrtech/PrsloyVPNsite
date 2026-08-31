import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { installFakeRedis } from "./fake-redis";
import {
  attachPaymentTransaction,
  createPaymentOrder,
  getLatestPaymentOrder,
  getPaymentOrder,
  issueKeyForOrder,
  providerStatusToPaymentStatus,
  updatePaymentByTransaction,
} from "@/lib/payments";
import { getSubscriptionRecord } from "@/lib/marzneshin-proxy";
import { registerUser } from "@/lib/auth";
import { listAuditEntries } from "@/lib/admin-audit";
import { todayKey } from "@/lib/analytics";

const redis = installFakeRedis();

beforeEach(() => {
  redis.reset();
});

describe("payments", () => {
  it("creates a latest payment order with calculated totals", async () => {
    const order = await createPaymentOrder({
      userId: "user-1",
      email: "buyer@example.com",
      period: "6mo",
      method: "sbp_qr",
    });

    expect(order.amountUsd).toBe(10.6);
    expect(order.amountRub).toBe(954);
    expect(order.status).toBe("created");
    await expect(getLatestPaymentOrder("user-1")).resolves.toMatchObject({
      id: order.id,
      email: "buyer@example.com",
    });
  });

  it("attaches a provider transaction and updates status by callback", async () => {
    const order = await createPaymentOrder({
      userId: "user-1",
      email: "buyer@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-1",
      paymentUrl: "https://pay.example/tx-1",
      providerStatus: "PENDING",
    });

    const { order: updated, confirmedNow } = await updatePaymentByTransaction({
      transactionId: "tx-1",
      providerStatus: "CONFIRMED",
    });

    expect(updated.status).toBe("confirmed");
    expect(updated.confirmedAt).toBeTruthy();
    expect(confirmedNow).toBe(true);
    await expect(getLatestPaymentOrder("user-1")).resolves.toMatchObject({
      status: "confirmed",
      transactionId: "tx-1",
    });
  });

  it("flags confirmedNow only on the first confirmation transition", async () => {
    const order = await createPaymentOrder({
      userId: "user-2",
      email: "buyer2@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-2",
      paymentUrl: "https://pay.example/tx-2",
      providerStatus: "PENDING",
    });

    const first = await updatePaymentByTransaction({
      transactionId: "tx-2",
      providerStatus: "CONFIRMED",
    });
    const second = await updatePaymentByTransaction({
      transactionId: "tx-2",
      providerStatus: "CONFIRMED",
    });
    const third = await updatePaymentByTransaction({
      transactionId: "tx-2",
      providerStatus: "CONFIRMED",
    });

    expect(first.confirmedNow).toBe(true);
    expect(second.confirmedNow).toBe(false);
    expect(third.confirmedNow).toBe(false);
    // confirmedAt is set on the first call and never overwritten.
    expect(first.order.confirmedAt).toBe(second.order.confirmedAt);
    expect(first.order.confirmedAt).toBe(third.order.confirmedAt);
  });

  it("two concurrent CONFIRMED callbacks: exactly one flags confirmedNow", async () => {
    const order = await createPaymentOrder({
      userId: "user-race",
      email: "racer@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-race",
      paymentUrl: "https://pay.example/tx-race",
      providerStatus: "PENDING",
    });

    // Both calls start before either save lands — same `previousStatus`
    // read on both. The NX-gate is the source of truth.
    const [a, b] = await Promise.all([
      updatePaymentByTransaction({
        transactionId: "tx-race",
        providerStatus: "CONFIRMED",
      }),
      updatePaymentByTransaction({
        transactionId: "tx-race",
        providerStatus: "CONFIRMED",
      }),
    ]);

    const winners = [a.confirmedNow, b.confirmedNow].filter(Boolean);
    expect(winners.length).toBe(1);
    expect(a.order.status).toBe("confirmed");
    expect(b.order.status).toBe("confirmed");
  });

  it("does not flag confirmedNow on a pending callback", async () => {
    const order = await createPaymentOrder({
      userId: "user-3",
      email: "buyer3@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-3",
      paymentUrl: "https://pay.example/tx-3",
      providerStatus: "PENDING",
    });

    const result = await updatePaymentByTransaction({
      transactionId: "tx-3",
      providerStatus: "PENDING",
    });

    expect(result.confirmedNow).toBe(false);
    expect(result.order.status).toBe("pending");
  });

  it("stores utmSource on the created order", async () => {
    const order = await createPaymentOrder({
      userId: "user-4",
      email: "buyer4@example.com",
      period: "1mo",
      method: "sbp_qr",
      utmSource: "telegram",
    });

    expect(order.utmSource).toBe("telegram");
  });

  it("stores null utmSource when none is provided", async () => {
    const order = await createPaymentOrder({
      userId: "user-5",
      email: "buyer5@example.com",
      period: "1mo",
      method: "sbp_qr",
    });

    expect(order.utmSource).toBeNull();
  });

  it("maps Platega statuses into local order statuses", () => {
    expect(providerStatusToPaymentStatus("CONFIRMED")).toBe("confirmed");
    expect(providerStatusToPaymentStatus("CANCELED")).toBe("canceled");
    expect(providerStatusToPaymentStatus("CHARGEBACKED")).toBe("chargebacked");
    expect(providerStatusToPaymentStatus("EXPIRED")).toBe("failed");
    expect(providerStatusToPaymentStatus("PENDING")).toBe("pending");
  });
});

describe("payments — Marzneshin auto-issue (Issue #4)", () => {
  const MARZ_URL = "https://hellcat.example.com";
  const MARZ_SECRET = "test-marz-secret-32-bytes-of-data-x";
  // Pass-through wrapper: fake-redis stubbed fetch handles its own URLs,
  // we hijack only requests to the marzneshin proxy endpoint.
  let fetchSpy: MockInstance;
  let marzCalls: Array<{ url: string; init: RequestInit }>;
  let marzResponses: Response[];
  // Same boundary-mock pattern as marzCalls above, but for the operator
  // alert email so reportAutoIssueFailure's Resend call can be asserted
  // on without mocking @/lib/email wholesale.
  let resendCalls: Array<{ url: string; init: RequestInit }>;

  beforeEach(() => {
    redis.reset();
    process.env.MARZNESHIN_PROXY_URL = MARZ_URL;
    process.env.MARZNESHIN_PROXY_HMAC_SECRET = MARZ_SECRET;
    marzCalls = [];
    marzResponses = [];
    resendCalls = [];
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
        if (u.includes("api.resend.com/emails")) {
          resendCalls.push({ url: u, init: init ?? {} });
          return new Response(JSON.stringify({ id: "email-fake-id" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return original(url, init);
      });
  });

  afterEach(() => {
    delete process.env.MARZNESHIN_PROXY_URL;
    delete process.env.MARZNESHIN_PROXY_HMAC_SECRET;
    delete process.env.WAITLIST_NOTIFY_EMAIL;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
    fetchSpy.mockRestore();
  });

  function analyticsEvents(name: string): Array<Record<string, unknown>> {
    const log = redis.store.lists.get(`analytics:dev:log:${todayKey()}`) ?? [];
    return log
      .map((entry) => JSON.parse(entry) as Record<string, unknown>)
      .filter((event) => event.name === name);
  }

  // key_issued/issue_failed are fired via `void track(...)` inside
  // payments.ts (no route-level `after()` to hook into like the other
  // callers of track()), so the write can still be in flight when the
  // awaited call above returns. Flush pending microtasks/timers before
  // reading the log back.
  async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  function queueProxy200(body: { marz_username: string; subscription_url: string }) {
    marzResponses.push(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
  }

  it("calls partner proxy on first confirmation and saves subscription record", async () => {
    const order = await createPaymentOrder({
      userId: "user-mz1",
      email: "marz1@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-mz1",
      paymentUrl: "https://pay.example/x",
      providerStatus: "PENDING",
    });
    queueProxy200({
      marz_username: "p_user_mz1",
      subscription_url: "https://sub.example/p_user_mz1/abcdef",
    });

    await updatePaymentByTransaction({
      transactionId: "tx-mz1",
      providerStatus: "CONFIRMED",
    });

    expect(marzCalls).toHaveLength(1);
    expect(marzCalls[0].url).toBe(`${MARZ_URL}/external/issue-key`);
    const body = JSON.parse(marzCalls[0].init.body as string);
    expect(body).toMatchObject({
      payment_id: order.id,
      period_days: 30,
      prsloy_user_id: "user-mz1",
      email: "marz1@example.com",
    });

    const record = await getSubscriptionRecord("user-mz1");
    expect(record).toMatchObject({
      marzUsername: "p_user_mz1",
      subscriptionUrl: "https://sub.example/p_user_mz1/abcdef",
      periodDays: 30,
      paymentId: order.id,
      source: "auto-issue",
    });
  });

  it("uses 180 days for 6mo and 365 for 1yr periods", async () => {
    queueProxy200({ marz_username: "p_a", subscription_url: "https://s/a" });
    queueProxy200({ marz_username: "p_b", subscription_url: "https://s/b" });
    for (const period of ["6mo", "1yr"] as const) {
      const order = await createPaymentOrder({
        userId: `user-${period}`,
        email: `${period}@example.com`,
        period,
        method: "sbp_qr",
      });
      await attachPaymentTransaction({
        orderId: order.id,
        transactionId: `tx-${period}`,
        paymentUrl: "x",
        providerStatus: "PENDING",
      });
      await updatePaymentByTransaction({
        transactionId: `tx-${period}`,
        providerStatus: "CONFIRMED",
      });
    }
    expect(marzCalls).toHaveLength(2);
    expect(JSON.parse(marzCalls[0].init.body as string).period_days).toBe(180);
    expect(JSON.parse(marzCalls[1].init.body as string).period_days).toBe(365);
  });

  it("does NOT call partner proxy if MARZNESHIN env not configured", async () => {
    delete process.env.MARZNESHIN_PROXY_URL;
    const order = await createPaymentOrder({
      userId: "user-noenv",
      email: "noenv@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-noenv",
      paymentUrl: "x",
      providerStatus: "PENDING",
    });

    const result = await updatePaymentByTransaction({
      transactionId: "tx-noenv",
      providerStatus: "CONFIRMED",
    });

    expect(result.confirmedNow).toBe(true);
    expect(marzCalls).toHaveLength(0);
    expect(await getSubscriptionRecord("user-noenv")).toBeNull();
  });

  it("payment still confirms even when partner proxy fails (no rollback)", async () => {
    const order = await createPaymentOrder({
      userId: "user-failover",
      email: "fail@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-failover",
      paymentUrl: "x",
      providerStatus: "PENDING",
    });
    // Two 502 responses → proxy_upstream_failure after retry
    marzResponses.push(new Response("err", { status: 502 }));
    marzResponses.push(new Response("err", { status: 502 }));

    const result = await updatePaymentByTransaction({
      transactionId: "tx-failover",
      providerStatus: "CONFIRMED",
    });

    expect(result.order.status).toBe("confirmed");
    expect(result.confirmedNow).toBe(true);
    expect(marzCalls).toHaveLength(2); // initial + 1 retry
    expect(await getSubscriptionRecord("user-failover")).toBeNull();
  });

  it("flips AuthUser to active with subscriptionUrl after auto-issue", async () => {
    process.env.AUTH_SECRET = "x".repeat(32);
    const user = await registerUser("e2e@example.com", "supersecret");
    const order = await createPaymentOrder({
      userId: user.id,
      email: "e2e@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-e2e",
      paymentUrl: "x",
      providerStatus: "PENDING",
    });
    queueProxy200({
      marz_username: "p_e2e",
      subscription_url: "https://sub/p_e2e/abcdef",
    });

    await updatePaymentByTransaction({
      transactionId: "tx-e2e",
      providerStatus: "CONFIRMED",
    });

    // Fetch via the same surface /api/auth/me uses
    const { getUserByEmail } = await import("@/lib/auth");
    const updated = await getUserByEmail("e2e@example.com");
    expect(updated?.accessStatus).toBe("active");
    expect(updated?.subscriptionUrl).toBe("https://sub/p_e2e/abcdef");
    expect(updated?.vpnSlug).toBeTruthy();
    delete process.env.AUTH_SECRET;
  });

  it("does NOT re-issue on repeated CONFIRMED callbacks (NX gate)", async () => {
    const order = await createPaymentOrder({
      userId: "user-replay",
      email: "replay@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-replay",
      paymentUrl: "x",
      providerStatus: "PENDING",
    });
    queueProxy200({
      marz_username: "p_user_replay",
      subscription_url: "https://sub/p_user_replay/k",
    });

    await updatePaymentByTransaction({
      transactionId: "tx-replay",
      providerStatus: "CONFIRMED",
    });
    await updatePaymentByTransaction({
      transactionId: "tx-replay",
      providerStatus: "CONFIRMED",
    });

    expect(marzCalls).toHaveLength(1);
  });

  it("emits key_issued and leaves issueError unset on a successful auto-issue", async () => {
    process.env.AUTH_SECRET = "x".repeat(32);
    const user = await registerUser("success@example.com", "supersecret");
    const order = await createPaymentOrder({
      userId: user.id,
      email: "success@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-success",
      paymentUrl: "x",
      providerStatus: "PENDING",
    });
    queueProxy200({
      marz_username: "p_success",
      subscription_url: "https://sub/p_success/k",
    });

    const result = await updatePaymentByTransaction({
      transactionId: "tx-success",
      providerStatus: "CONFIRMED",
    });

    expect(result.order.issueError).toBeFalsy();
    const stored = await getPaymentOrder(order.id);
    expect(stored?.issueError).toBeFalsy();

    await flushMicrotasks();
    const events = analyticsEvents("key_issued");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ userId: user.id });
    delete process.env.AUTH_SECRET;
    expect(analyticsEvents("issue_failed")).toHaveLength(0);
  });

  it("records issueError and writes an admin audit entry when auto-issue fails, without emailing when WAITLIST_NOTIFY_EMAIL is unset", async () => {
    const order = await createPaymentOrder({
      userId: "user-issuefail",
      email: "issuefail@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-issuefail",
      paymentUrl: "x",
      providerStatus: "PENDING",
    });
    // Two 502 responses → proxy_upstream_failure after retry.
    marzResponses.push(new Response("err", { status: 502 }));
    marzResponses.push(new Response("err", { status: 502 }));

    const result = await updatePaymentByTransaction({
      transactionId: "tx-issuefail",
      providerStatus: "CONFIRMED",
    });

    // The order still confirms — auto-issue failure never rolls back the
    // payment. It just marks the order for recovery.
    expect(result.confirmedNow).toBe(true);
    expect(result.order.status).toBe("confirmed");
    expect(result.order.issueError).toBe("proxy_upstream_failure");

    const stored = await getPaymentOrder(order.id);
    expect(stored?.issueError).toBe("proxy_upstream_failure");

    const log = await listAuditEntries(10);
    expect(log[0]).toMatchObject({
      action: "auto_issue",
      targetUserId: "user-issuefail",
      targetEmail: "issuefail@example.com",
      result: "error",
    });
    expect(log[0].note).toContain(order.id);
    expect(log[0].note).toContain("proxy_upstream_failure");

    expect(resendCalls).toHaveLength(0);

    await flushMicrotasks();
    const events = analyticsEvents("issue_failed");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ orderId: order.id });
  });

  it("emails the operator when WAITLIST_NOTIFY_EMAIL is set and auto-issue fails", async () => {
    process.env.WAITLIST_NOTIFY_EMAIL = "ops@example.com";
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM = "PRSLOY <noreply@example.com>";

    const order = await createPaymentOrder({
      userId: "user-issuefail-mail",
      email: "issuefail-mail@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-issuefail-mail",
      paymentUrl: "x",
      providerStatus: "PENDING",
    });
    marzResponses.push(new Response("err", { status: 502 }));
    marzResponses.push(new Response("err", { status: 502 }));

    await updatePaymentByTransaction({
      transactionId: "tx-issuefail-mail",
      providerStatus: "CONFIRMED",
    });

    expect(resendCalls).toHaveLength(1);
    const body = JSON.parse(resendCalls[0].init.body as string);
    expect(body.to).toBe("ops@example.com");
    expect(body.subject).toContain(order.id);
  });

  it("clears a pre-existing issueError once a retried issueKeyForOrder succeeds", async () => {
    process.env.AUTH_SECRET = "x".repeat(32);
    const user = await registerUser("clear@example.com", "supersecret");
    const order = await createPaymentOrder({
      userId: user.id,
      email: "clear@example.com",
      period: "1mo",
      method: "sbp_qr",
    });
    await attachPaymentTransaction({
      orderId: order.id,
      transactionId: "tx-clear",
      paymentUrl: "x",
      providerStatus: "PENDING",
    });
    // First confirmation: proxy fails, order gets issueError persisted.
    marzResponses.push(new Response("err", { status: 502 }));
    marzResponses.push(new Response("err", { status: 502 }));
    const first = await updatePaymentByTransaction({
      transactionId: "tx-clear",
      providerStatus: "CONFIRMED",
    });
    expect(first.order.issueError).toBe("proxy_upstream_failure");

    // Recovery path (mirrors /api/admin/reprocess): re-drive issueKeyForOrder
    // with the persisted order.
    const stored = await getPaymentOrder(order.id);
    expect(stored?.issueError).toBe("proxy_upstream_failure");
    queueProxy200({
      marz_username: "p_clear",
      subscription_url: "https://sub/p_clear/k",
    });

    await issueKeyForOrder(stored!);

    const after = await getPaymentOrder(order.id);
    expect(after?.issueError).toBeNull();
    expect(after?.status).toBe("confirmed");
    delete process.env.AUTH_SECRET;
  });
});
