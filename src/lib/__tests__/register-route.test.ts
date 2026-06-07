import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { todayKey } from "@/lib/analytics";
import { addInviteCodes } from "@/lib/access-pool";

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
  process.env.AUTH_SECRET = "x".repeat(32);
  // No RESEND_API_KEY → sendTransactionalEmail returns skipped without
  // touching fetch, which keeps the test hermetic.
});

afterEach(() => {
  delete process.env.AUTH_SECRET;
  delete process.env.VERCEL_ENV;
});

async function flushAfter() {
  while (afterQueue.length > 0) {
    const cb = afterQueue.shift()!;
    await cb();
  }
}

async function importRoute() {
  return await import("@/app/api/auth/register/route");
}

// Builds a request as-is. Each test pre-seeds its own invite codes via
// addInviteCodes and passes inviteCode in the body, so the helper stays
// thin and explicit. Tests that exercise the no-code path (rate-limit,
// invalid-email) simply omit the field.
function registerReq(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
    },
    body: JSON.stringify(body),
  });
}

function registerEvents(): Array<Record<string, unknown>> {
  const date = todayKey();
  const log = redis.store.lists.get(`analytics:dev:log:${date}`) ?? [];
  return log
    .map((entry) => JSON.parse(entry) as Record<string, unknown>)
    .filter((event) => event.name === "register_success");
}

describe("POST /api/auth/register — analytics", () => {
  it("emits register_success with utmSource on successful registration", async () => {
    await addInviteCodes(["INV-ALICE"]);
    const { POST } = await importRoute();
    const res = await POST(
      registerReq({
        email: "alice@example.com",
        password: "supersecret",
        inviteCode: "INV-ALICE",
        locale: "ru",
        utmSource: "telegram",
      })
    );
    expect(res.status).toBe(200);
    await flushAfter();

    const events = registerEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: "register_success",
      utmSource: "telegram",
    });
    expect(typeof events[0].userId).toBe("string");
  });

  it("emits register_success without utmSource when absent", async () => {
    await addInviteCodes(["INV-BOB"]);
    const { POST } = await importRoute();
    await POST(
      registerReq({
        email: "bob@example.com",
        password: "supersecret",
        inviteCode: "INV-BOB",
      })
    );
    await flushAfter();

    const events = registerEvents();
    expect(events).toHaveLength(1);
    expect(events[0].utmSource).toBeUndefined();
  });

  it("does NOT emit register_success on duplicate email", async () => {
    await addInviteCodes(["INV-CLAIRE-1", "INV-CLAIRE-2"]);
    const { POST } = await importRoute();
    await POST(
      registerReq({
        email: "claire@example.com",
        password: "supersecret",
        inviteCode: "INV-CLAIRE-1",
      })
    );
    await flushAfter();

    expect(registerEvents()).toHaveLength(1);

    const res = await POST(
      registerReq({
        email: "claire@example.com",
        password: "supersecret",
        inviteCode: "INV-CLAIRE-2",
      })
    );
    expect(res.status).toBe(409);
    await flushAfter();

    expect(registerEvents()).toHaveLength(1);
  });

  it("does NOT emit register_success on invalid email", async () => {
    await addInviteCodes(["INV-BAD"]);
    const { POST } = await importRoute();
    const res = await POST(
      registerReq({
        email: "not-an-email",
        password: "supersecret",
        inviteCode: "INV-BAD",
      })
    );
    expect(res.status).toBe(400);
    await flushAfter();

    expect(registerEvents()).toHaveLength(0);
  });

  it("does NOT emit register_success on rate-limit", async () => {
    const { POST } = await importRoute();
    // Fixed IP so all 5+1 calls hit the same bucket.
    function fixedIpReq(body: Record<string, unknown>): Request {
      return new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.99",
        },
        body: JSON.stringify(body),
      });
    }
    for (let i = 0; i < 5; i += 1) {
      await POST(fixedIpReq({ email: `u${i}@example.com`, password: "supersecret" }));
    }
    await flushAfter();
    const baseline = registerEvents().length;

    const res = await POST(
      fixedIpReq({ email: "spam@example.com", password: "supersecret" })
    );
    expect(res.status).toBe(429);
    await flushAfter();

    expect(registerEvents().length).toBe(baseline);
  });

  it("preserves the helpful email_exists 409 for a valid-invite holder on an existing email", async () => {
    // The reorder must close the oracle WITHOUT hiding the helpful 'email
    // exists, go log in' message from a legit user who holds a real invite.
    await addInviteCodes(["INV-DUP-1", "INV-DUP-2"]);
    const { POST } = await importRoute();
    await POST(
      registerReq({
        email: "dup@example.com",
        password: "supersecret",
        inviteCode: "INV-DUP-1",
      })
    );
    await flushAfter();

    const res = await POST(
      registerReq({
        email: "dup@example.com",
        password: "supersecret",
        inviteCode: "INV-DUP-2",
      })
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email_exists");
  });

  it("closes the email-enumeration oracle: invalid invite → 403 whether the email exists or not", async () => {
    await addInviteCodes(["INV-REAL"]);
    const { POST } = await importRoute();
    // Seed a real account.
    await POST(
      registerReq({
        email: "taken@example.com",
        password: "supersecret",
        inviteCode: "INV-REAL",
      })
    );
    await flushAfter();

    // Existing email + a non-existent invite must be invite_invalid (403),
    // NOT email_exists (409) — a 409-vs-403 split would leak which emails are
    // registered to a caller holding no valid invite.
    const existing = await POST(
      registerReq({
        email: "taken@example.com",
        password: "supersecret",
        inviteCode: "NOPE-NOPE",
      })
    );
    expect(existing.status).toBe(403);
    expect((await existing.json()).error).toBe("invite_invalid");

    // Non-existing email + same bad invite → also 403. Indistinguishable.
    const missing = await POST(
      registerReq({
        email: "fresh@example.com",
        password: "supersecret",
        inviteCode: "NOPE-NOPE",
      })
    );
    expect(missing.status).toBe(403);
    expect((await missing.json()).error).toBe("invite_invalid");
  });

  it("sanitizes utmSource via the analytics key sanitizer", async () => {
    await addInviteCodes(["INV-DOE"]);
    const { POST } = await importRoute();
    await POST(
      registerReq({
        email: "doe@example.com",
        password: "supersecret",
        inviteCode: "INV-DOE",
        utmSource: "Telegram Ads",
      })
    );
    await flushAfter();

    const events = registerEvents();
    expect(events).toHaveLength(1);
    expect(events[0].utmSource).toBe("telegram_ads");
  });
});
