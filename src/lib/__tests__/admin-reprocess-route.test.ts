import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { registerUser } from "@/lib/auth";
import { attachPaymentTransaction, createPaymentOrder } from "@/lib/payments";

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

    // A second reprocess of an already-confirmed order is a no-op.
    const r2 = await POST(req({ email: "pay@example.com" }));
    const d2 = await r2.json();
    expect(d2.status).toBe("confirmed");
    expect(d2.confirmedNow).toBe(false);
  });
});
