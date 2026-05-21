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

    const updated = await updatePaymentByTransaction({
      transactionId: "tx-1",
      providerStatus: "CONFIRMED",
    });

    expect(updated.status).toBe("confirmed");
    expect(updated.confirmedAt).toBeTruthy();
    await expect(getLatestPaymentOrder("user-1")).resolves.toMatchObject({
      status: "confirmed",
      transactionId: "tx-1",
    });
  });

  it("maps Platega statuses into local order statuses", () => {
    expect(providerStatusToPaymentStatus("CONFIRMED")).toBe("confirmed");
    expect(providerStatusToPaymentStatus("CANCELED")).toBe("canceled");
    expect(providerStatusToPaymentStatus("CHARGEBACKED")).toBe("chargebacked");
    expect(providerStatusToPaymentStatus("EXPIRED")).toBe("failed");
    expect(providerStatusToPaymentStatus("PENDING")).toBe("pending");
  });
});
