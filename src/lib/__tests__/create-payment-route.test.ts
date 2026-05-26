import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";

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

// Stub Platega so we don't hit the real provider. Returns a deterministic
// transactionId and a payment URL that the route then attaches to the order.
vi.mock("@/lib/platega", () => ({
  createPlategaPayment: vi.fn(async () => ({
    transactionId: "tx-stub-1",
    paymentUrl: "https://pay.example.invalid/tx-stub-1",
    status: "PENDING",
  })),
  getPlategaSetupErrorCode: () => null,
}));

// getCurrentUser is the only thing on @/lib/auth the route uses for gating —
// stub it to a fixed user so we don't need cookie/session plumbing.
const STUB_USER = { id: "user-1", email: "buyer@example.com" };
vi.mock("@/lib/auth", () => ({
  getCurrentUser: vi.fn(async () => STUB_USER),
  getAuthSetupErrorCode: () => null,
}));

const redis = installFakeRedis();

beforeEach(() => {
  redis.reset();
  afterQueue.length = 0;
});

afterEach(() => {
  delete process.env.VERCEL_ENV;
});

async function flushAfter() {
  while (afterQueue.length > 0) {
    const cb = afterQueue.shift()!;
    await cb();
  }
}

async function importRoute() {
  return await import("@/app/api/payments/platega/create/route");
}

function createReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/payments/platega/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function paymentStartedEvents(): Array<Record<string, unknown>> {
  const date = new Date().toISOString().slice(0, 10);
  const log = redis.store.lists.get(`analytics:dev:log:${date}`) ?? [];
  return log
    .map((entry) => JSON.parse(entry) as Record<string, unknown>)
    .filter((event) => event.name === "payment_started");
}

describe("POST /api/payments/platega/create — analytics", () => {
  it("emits payment_started with utmSource and method on success", async () => {
    const { POST } = await importRoute();
    const res = await POST(
      createReq({ period: "1mo", locale: "ru", method: "sbp_qr", utmSource: "telegram" })
    );
    expect(res.status).toBe(200);
    await flushAfter();

    const events = paymentStartedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "payment_started",
      method: "sbp_qr",
      utmSource: "telegram",
    });
    expect(typeof events[0].orderId).toBe("string");
  });

  it("emits payment_started without utmSource when absent", async () => {
    const { POST } = await importRoute();
    await POST(createReq({ period: "1mo", locale: "ru", method: "sbp_qr" }));
    await flushAfter();

    const events = paymentStartedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].utmSource).toBeUndefined();
  });

  it("does NOT emit payment_started on invalid period", async () => {
    const { POST } = await importRoute();
    const res = await POST(createReq({ period: "junk", locale: "ru", method: "sbp_qr" }));
    expect(res.status).toBe(400);
    await flushAfter();
    expect(paymentStartedEvents()).toHaveLength(0);
  });

  it("does NOT emit payment_started on invalid method", async () => {
    const { POST } = await importRoute();
    const res = await POST(createReq({ period: "1mo", locale: "ru", method: "junk" }));
    expect(res.status).toBe(400);
    await flushAfter();
    expect(paymentStartedEvents()).toHaveLength(0);
  });

  it("does NOT emit payment_started when the user is unauthenticated", async () => {
    const auth = (await import("@/lib/auth")) as unknown as {
      getCurrentUser: ReturnType<typeof vi.fn>;
    };
    auth.getCurrentUser.mockResolvedValueOnce(null);

    const { POST } = await importRoute();
    const res = await POST(createReq({ period: "1mo", locale: "ru", method: "sbp_qr" }));
    expect(res.status).toBe(401);
    await flushAfter();
    expect(paymentStartedEvents()).toHaveLength(0);
  });

  it("counts payment_started in funnel:payment_started:<source> AND method counter", async () => {
    const { POST } = await importRoute();
    await POST(
      createReq({ period: "1mo", locale: "ru", method: "crypto", utmSource: "instagram" })
    );
    await flushAfter();

    const date = new Date().toISOString().slice(0, 10);
    expect(
      redis.store.strings.get(`analytics:dev:funnel:${date}:payment_started:instagram`)
    ).toBe("1");
    expect(redis.store.strings.get(`analytics:dev:method:${date}:crypto`)).toBe("1");
  });
});
