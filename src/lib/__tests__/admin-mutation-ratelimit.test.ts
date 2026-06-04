import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { registerUser } from "@/lib/auth";
import { listAuditEntries } from "@/lib/admin-audit";
import { createReissueRequest } from "@/lib/reissue";

// Completes the spec §2 coverage: every mutating admin route is rate-limited.
// issue/access/grant have their own route specs; this pins the remaining
// three (users DELETE, reissue PATCH, access-pool add) plus the delete audit.

const redis = installFakeRedis();
const SECRET = "admin-mutation-rl-secret-1234567890";

beforeEach(() => {
  redis.reset();
  process.env.ADMIN_SECRET = SECRET;
  process.env.AUTH_SECRET = "x".repeat(32);
});

afterEach(() => {
  delete process.env.ADMIN_SECRET;
  delete process.env.AUTH_SECRET;
});

function authed(method: string, url: string, body: unknown): Request {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      authorization: `Bearer ${SECRET}`,
    },
    body: JSON.stringify(body),
  });
}

describe("DELETE /api/admin/users — rate limit + audit", () => {
  it("returns 429 only once the per-action limit is exceeded", async () => {
    const { DELETE } = await import("@/app/api/admin/users/route");
    // DELETE_LIMIT = 20 / 60s. Empty body -> 400 (user_id_required) pre-limit.
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await DELETE(
        authed("DELETE", "http://localhost/api/admin/users", {})
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s !== 429)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("writes a delete audit row on a successful deletion", async () => {
    const user = await registerUser("del-audit@example.com", "password123");
    const { DELETE } = await import("@/app/api/admin/users/route");
    const res = await DELETE(
      authed("DELETE", "http://localhost/api/admin/users", { userId: user.id })
    );
    expect(res.status).toBe(200);
    const log = await listAuditEntries(10);
    expect(log[0]).toMatchObject({
      action: "delete",
      targetUserId: user.id,
      result: "ok",
    });
  });
});

describe("PATCH /api/admin/reissue — rate limit", () => {
  it("returns 429 only once the per-action limit is exceeded", async () => {
    const { PATCH } = await import("@/app/api/admin/reissue/route");
    // REISSUE_LIMIT = 30 / 60s. Empty body -> 400 (request_id_required).
    const statuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      const res = await PATCH(
        authed("PATCH", "http://localhost/api/admin/reissue", {})
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 30).every((s) => s !== 429)).toBe(true);
    expect(statuses[30]).toBe(429);
  });

  it("writes a reissue_handled audit row on mark-handled", async () => {
    const request = await createReissueRequest({
      userId: "u-reissue",
      email: "reissue@example.com",
      vpnSlug: "slug1",
      subscriptionUrl: "https://sub.example/x",
      reason: "",
    });
    const { PATCH } = await import("@/app/api/admin/reissue/route");
    const res = await PATCH(
      authed("PATCH", "http://localhost/api/admin/reissue", {
        requestId: request.requestId,
        action: "mark_handled",
      })
    );
    expect(res.status).toBe(200);
    const log = await listAuditEntries(10);
    expect(log[0]).toMatchObject({
      action: "reissue_handled",
      targetUserId: "u-reissue",
      result: "ok",
    });
  });
});

describe("POST /api/admin/access-pool/add — rate limit", () => {
  it("returns 429 only once the per-action limit is exceeded", async () => {
    const { POST } = await import("@/app/api/admin/access-pool/add/route");
    // POOL_ADD_LIMIT = 20 / 60s. Empty body -> 400 (codes_required).
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const res = await POST(
        authed("POST", "http://localhost/api/admin/access-pool/add", {})
      );
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 20).every((s) => s !== 429)).toBe(true);
    expect(statuses[20]).toBe(429);
  });

  it("writes a codes_added audit row on a successful add", async () => {
    const { POST } = await import("@/app/api/admin/access-pool/add/route");
    const res = await POST(
      authed("POST", "http://localhost/api/admin/access-pool/add", {
        codes: ["aud-c1", "aud-c2"],
      })
    );
    expect(res.status).toBe(200);
    const log = await listAuditEntries(10);
    expect(log[0]).toMatchObject({ action: "codes_added", result: "ok" });
  });
});
