import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { getUserByEmail, registerUser } from "@/lib/auth";
import { listAuditEntries } from "@/lib/admin-audit";

const redis = installFakeRedis();
const SECRET = "admin-access-test-secret-1234567890";

beforeEach(() => {
  redis.reset();
  process.env.ADMIN_SECRET = SECRET;
  process.env.AUTH_SECRET = "x".repeat(32);
});

afterEach(() => {
  delete process.env.ADMIN_SECRET;
  delete process.env.AUTH_SECRET;
});

async function importRoute() {
  return await import("@/app/api/admin/access/route");
}

function makeReq(body: unknown, opts: { auth?: boolean } = {}): Request {
  const auth = opts.auth ?? true;
  return new Request("http://localhost/api/admin/access", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { authorization: `Bearer ${SECRET}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/admin/access", () => {
  it("returns 404 when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const { PATCH } = await importRoute();
    const res = await PATCH(
      makeReq({ userId: "x", blocked: true }, { auth: false })
    );
    expect(res.status).toBe(404);
  });

  it("returns 401 without a Bearer token", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(
      makeReq({ userId: "x", blocked: true }, { auth: false })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when blocked is not a boolean", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makeReq({ userId: "x" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("blocked_required");
  });

  it("returns 404 for an unknown user", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(makeReq({ userId: "ghost", blocked: true }));
    expect(res.status).toBe(404);
  });

  it("blocks a user and writes a block audit entry", async () => {
    const user = await registerUser("mod@example.com", "password123");
    const { PATCH } = await importRoute();
    const res = await PATCH(makeReq({ userId: user.id, blocked: true }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.accessStatus).toBe("blocked");

    const stored = await getUserByEmail("mod@example.com");
    expect(stored?.accessStatus).toBe("blocked");

    const log = await listAuditEntries(10);
    expect(log[0]).toMatchObject({
      action: "block",
      targetUserId: user.id,
      result: "ok",
    });
  });

  it("unblock restores pending for a key-less user and logs unblock", async () => {
    const user = await registerUser("mod2@example.com", "password123");
    const { PATCH } = await importRoute();
    await PATCH(makeReq({ userId: user.id, blocked: true }));
    const res = await PATCH(makeReq({ userId: user.id, blocked: false }));
    const data = await res.json();
    expect(data.user.accessStatus).toBe("pending");

    const log = await listAuditEntries(10);
    expect(log[0].action).toBe("unblock");
  });
});
