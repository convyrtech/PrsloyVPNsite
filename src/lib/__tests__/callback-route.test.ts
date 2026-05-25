import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { attachPaymentTransaction, createPaymentOrder } from "@/lib/payments";

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
  // The callback route is gated on Platega being "configured" — set both
  // env vars so isPlategaConfigured() returns true.
  process.env.PLATEGA_MERCHANT_ID = "merchant-test";
  process.env.PLATEGA_SECRET = "secret-test";
});

afterEach(() => {
  delete process.env.PLATEGA_MERCHANT_ID;
  delete process.env.PLATEGA_SECRET;
  delete process.env.VERCEL_ENV;
});

async function flushAfter() {
  while (afterQueue.length > 0) {
    const cb = afterQueue.shift()!;
    await cb();
  }
}

async function importRoute() {
  return await import("@/app/api/payments/platega/callback/route");
}

async function seedConfirmableOrder(opts: {
  transactionId: string;
  utmSource?: string | null;
}) {
  const order = await createPaymentOrder({
    userId: "user-cb",
    email: "buyer@example.com",
    period: "1mo",
    method: "sbp_qr",
    utmSource: opts.utmSource ?? null,
  });
  await attachPaymentTransaction({
    orderId: order.id,
    transactionId: opts.transactionId,
    paymentUrl: "https://pay.example/x",
    providerStatus: "PENDING",
  });
}

function callbackReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/payments/platega/callback", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-merchantid": "merchant-test",
      "x-secret": "secret-test",
    },
    body: JSON.stringify(body),
  });
}

function paymentConfirmedEvents(): Array<Record<string, unknown>> {
  const date = new Date().toISOString().slice(0, 10);
  const log = redis.store.lists.get(`analytics:dev:log:${date}`) ?? [];
  return log
    .map((entry) => JSON.parse(entry) as Record<string, unknown>)
    .filter((event) => event.name === "payment_confirmed");
}

describe("POST /api/payments/platega/callback — analytics", () => {
  it("emits payment_confirmed exactly once on the first confirmation", async () => {
    await seedConfirmableOrder({ transactionId: "tx-A", utmSource: "telegram" });
    const { POST } = await importRoute();

    const res = await POST(
      callbackReq({ id: "tx-A", status: "CONFIRMED" })
    );
    expect(res.status).toBe(200);
    await flushAfter();

    const events = paymentConfirmedEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "payment_confirmed",
      utmSource: "telegram",
    });
    expect(typeof events[0].amountRub).toBe("number");
    expect(events[0].amountRub).toBeGreaterThan(0);
  });

  it("does not emit payment_confirmed on a repeated CONFIRMED callback", async () => {
    await seedConfirmableOrder({ transactionId: "tx-B" });
    const { POST } = await importRoute();

    await POST(callbackReq({ id: "tx-B", status: "CONFIRMED" }));
    await flushAfter();
    await POST(callbackReq({ id: "tx-B", status: "CONFIRMED" }));
    await flushAfter();
    await POST(callbackReq({ id: "tx-B", status: "CONFIRMED" }));
    await flushAfter();

    expect(paymentConfirmedEvents()).toHaveLength(1);
  });

  it("does not emit payment_confirmed on PENDING / FAILED / CANCELED", async () => {
    await seedConfirmableOrder({ transactionId: "tx-C" });
    const { POST } = await importRoute();

    await POST(callbackReq({ id: "tx-C", status: "PENDING" }));
    await POST(callbackReq({ id: "tx-C", status: "FAILED" }));
    await POST(callbackReq({ id: "tx-C", status: "CANCELED" }));
    await flushAfter();

    expect(paymentConfirmedEvents()).toHaveLength(0);
  });

  it("emits payment_confirmed without utmSource when order has none", async () => {
    await seedConfirmableOrder({ transactionId: "tx-D", utmSource: null });
    const { POST } = await importRoute();

    await POST(callbackReq({ id: "tx-D", status: "CONFIRMED" }));
    await flushAfter();

    const events = paymentConfirmedEvents();
    expect(events).toHaveLength(1);
    expect(events[0].utmSource).toBeUndefined();
  });

  it("rejects unauthorized callback without writing analytics", async () => {
    await seedConfirmableOrder({ transactionId: "tx-E" });
    const { POST } = await importRoute();

    const unauth = new Request(
      "http://localhost/api/payments/platega/callback",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: "tx-E", status: "CONFIRMED" }),
      }
    );
    const res = await POST(unauth);
    expect(res.status).toBe(401);
    await flushAfter();
    expect(paymentConfirmedEvents()).toHaveLength(0);
  });
});
