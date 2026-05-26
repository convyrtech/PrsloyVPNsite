import { beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import {
  attachPaymentTransaction,
  createPaymentOrder,
  getLatestPaymentOrder,
  providerStatusToPaymentStatus,
  updatePaymentByTransaction,
} from "@/lib/payments";

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

    expect(order.amountUsd).toBe(24);
    expect(order.amountRub).toBe(2160);
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
