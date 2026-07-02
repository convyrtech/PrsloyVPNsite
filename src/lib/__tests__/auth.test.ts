import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";

process.env.AUTH_SECRET = "test-auth-secret-value-at-least-32-characters";

// auth.ts imports next/headers; cookies() is driven through this jar.
const cookieJar = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieJar.value === undefined ? undefined : { value: cookieJar.value },
  }),
}));

import {
  AuthError,
  createSession,
  deleteUser,
  destroySession,
  findUserByIdentifier,
  getCurrentUser,
  getUserByEmail,
  getUserByTelegramId,
  grantAccess,
  issueVerificationToken,
  linkEmail,
  listUsers,
  loginOrRegisterByTelegram,
  loginUser,
  registerUser,
  setAccessBlocked,
  verifyEmailToken,
} from "@/lib/auth";

const redis = installFakeRedis();

beforeEach(() => {
  redis.reset();
  cookieJar.value = undefined;
});

describe("registerUser", () => {
  it("creates a pending account and returns it without the password hash", async () => {
    const user = await registerUser("new@example.com", "password123");
    expect(user.email).toBe("new@example.com");
    expect(user.accessStatus).toBe("pending");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("rejects a duplicate email", async () => {
    await registerUser("dup@example.com", "password123");
    await expect(
      registerUser("dup@example.com", "password123")
    ).rejects.toMatchObject({ code: "email_exists" });
  });

  it("rejects an invalid email and a too-short password", async () => {
    await expect(registerUser("bad-email", "password123")).rejects.toMatchObject({
      code: "invalid_email",
    });
    await expect(registerUser("ok@example.com", "short")).rejects.toMatchObject({
      code: "invalid_password",
    });
  });
});

describe("linkEmail", () => {
  it("links an email to a Telegram-created user, leaving it unverified", async () => {
    const { user } = await loginOrRegisterByTelegram({
      telegramId: "9001",
      telegramUsername: "linkme",
    });

    const linked = await linkEmail(user.id, "linkme@example.com");

    expect(linked.email).toBe("linkme@example.com");
    expect(linked.emailVerified).toBe(false);

    const found = await getUserByEmail("linkme@example.com");
    expect(found?.id).toBe(user.id);
  });

  it("rejects an invalid email", async () => {
    const { user } = await loginOrRegisterByTelegram({
      telegramId: "9002",
      telegramUsername: "badmail",
    });

    await expect(linkEmail(user.id, "not-an-email")).rejects.toMatchObject({
      code: "invalid_email",
    });
  });

  it("rejects an email already used by another account, leaving that account's mapping intact", async () => {
    const owner = await registerUser("owner@example.com", "password123");
    const { user } = await loginOrRegisterByTelegram({
      telegramId: "9003",
      telegramUsername: "claimer",
    });

    await expect(linkEmail(user.id, "owner@example.com")).rejects.toMatchObject({
      code: "email_exists",
    });

    const found = await getUserByEmail("owner@example.com");
    expect(found?.id).toBe(owner.id);
  });

  it("rejects linking when the account already has an email", async () => {
    const user = await registerUser("already@example.com", "password123");

    await expect(linkEmail(user.id, "new@example.com")).rejects.toMatchObject({
      code: "email_already_set",
    });
  });

  it("rejects an unknown user id", async () => {
    await expect(linkEmail("ghost-id", "someone@example.com")).rejects.toMatchObject({
      code: "user_not_found",
    });
  });

  it("serializes concurrent link attempts — the loser cannot orphan an email index", async () => {
    const { user } = await loginOrRegisterByTelegram({
      telegramId: "9004",
      telegramUsername: "racer",
    });

    const results = await Promise.allSettled([
      linkEmail(user.id, "first@example.com"),
      linkEmail(user.id, "second@example.com"),
    ]);

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof linkEmail>>> =>
        r.status === "fulfilled"
    );
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected"
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0].reason as { code?: string }).code).toBe(
      "link_in_progress"
    );

    // The losing address must stay claimable — no orphan auth:email:* mapping.
    const winner = fulfilled[0].value.email;
    const loser =
      winner === "first@example.com"
        ? "second@example.com"
        : "first@example.com";
    expect(await getUserByEmail(loser)).toBeNull();

    // And the lock is released: a follow-up attempt reports the real state.
    await expect(linkEmail(user.id, loser)).rejects.toMatchObject({
      code: "email_already_set",
    });
  });
});

describe("loginUser", () => {
  it("returns the user for correct credentials", async () => {
    await registerUser("login@example.com", "password123");
    const user = await loginUser("login@example.com", "password123");
    expect(user.email).toBe("login@example.com");
  });

  it("rejects a wrong password and an unknown email", async () => {
    await registerUser("login@example.com", "password123");
    await expect(
      loginUser("login@example.com", "wrongpassword")
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      loginUser("ghost@example.com", "password123")
    ).rejects.toBeInstanceOf(AuthError);
  });
});

describe("sessions", () => {
  it("round-trips a session cookie back to the current user", async () => {
    const user = await registerUser("session@example.com", "password123");
    cookieJar.value = await createSession(user.id);
    const current = await getCurrentUser();
    expect(current?.email).toBe("session@example.com");
  });

  it("returns null once the session is destroyed", async () => {
    const user = await registerUser("session@example.com", "password123");
    const cookie = await createSession(user.id);
    cookieJar.value = cookie;
    await destroySession(cookie);
    expect(await getCurrentUser()).toBeNull();
  });

  it("returns null for a tampered cookie", async () => {
    const user = await registerUser("session@example.com", "password123");
    cookieJar.value = `${await createSession(user.id)}tampered`;
    expect(await getCurrentUser()).toBeNull();
  });
});

describe("verifyEmailToken", () => {
  it("marks the account verified for a valid token", async () => {
    const user = await registerUser("verify@example.com", "password123");
    const token = await issueVerificationToken(user.id);
    const verified = await verifyEmailToken(token);
    expect(verified.emailVerified).toBe(true);
  });

  it("rejects an unknown token", async () => {
    await expect(verifyEmailToken("not-a-real-token")).rejects.toBeInstanceOf(
      AuthError
    );
  });
});

describe("grantAccess", () => {
  it("activates access and assigns a slug plus subscription URL", async () => {
    await registerUser("grant@example.com", "password123");
    const granted = await grantAccess("grant@example.com", {
      subscriptionUrl: "https://sub.example.com/abc",
    });
    expect(granted.accessStatus).toBe("active");
    expect(granted.vpnSlug).toBeTruthy();
    expect(granted.subscriptionUrl).toBe("https://sub.example.com/abc");
  });

  it("rejects an unknown account", async () => {
    await expect(
      grantAccess("ghost@example.com", { subscriptionUrl: "https://x.example.com" })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("requires a subscription URL when the account has none", async () => {
    await registerUser("grant@example.com", "password123");
    await expect(grantAccess("grant@example.com")).rejects.toMatchObject({
      code: "subscription_url_required",
    });
  });

  it("refuses to re-activate a blocked account", async () => {
    const user = await registerUser("blocked@example.com", "password123");
    const { kvGet, kvSet } = await import("@/lib/kv");
    const raw = await kvGet(`auth:user:${user.id}`);
    const stored = JSON.parse(raw!);
    stored.accessStatus = "blocked";
    await kvSet(`auth:user:${user.id}`, JSON.stringify(stored));

    await expect(
      grantAccess("blocked@example.com", { subscriptionUrl: "https://sub.example.com/x" })
    ).rejects.toMatchObject({ code: "user_blocked" });

    // Make sure the record stayed blocked and the URL was not written.
    const after = JSON.parse((await kvGet(`auth:user:${user.id}`))!);
    expect(after.accessStatus).toBe("blocked");
    expect(after.subscriptionUrl).toBeNull();
  });
});

describe("setAccessBlocked", () => {
  it("blocks a key-holder and restores them to active on unblock", async () => {
    const user = await registerUser("blk@example.com", "password123");
    await grantAccess("blk@example.com", {
      subscriptionUrl: "https://sub.example.com/k",
    });

    const blocked = await setAccessBlocked(user.id, true);
    expect(blocked.accessStatus).toBe("blocked");
    // The config URL is preserved through a block — the key is only hidden.
    expect(blocked.subscriptionUrl).toBe("https://sub.example.com/k");

    const unblocked = await setAccessBlocked(user.id, false);
    expect(unblocked.accessStatus).toBe("active");
  });

  it("unblock falls back to pending when the user holds no key", async () => {
    const user = await registerUser("blk2@example.com", "password123");
    await setAccessBlocked(user.id, true);
    const unblocked = await setAccessBlocked(user.id, false);
    expect(unblocked.accessStatus).toBe("pending");
  });

  it("rejects an unknown account", async () => {
    await expect(setAccessBlocked("ghost", true)).rejects.toMatchObject({
      code: "not_found",
    });
  });
});

describe("findUserByIdentifier", () => {
  it("resolves by email without leaking the password hash", async () => {
    await registerUser("find@example.com", "password123");
    const user = await findUserByIdentifier("find@example.com");
    expect(user?.email).toBe("find@example.com");
    expect(user).not.toHaveProperty("passwordHash");
  });

  it("returns null for an unknown identifier", async () => {
    expect(await findUserByIdentifier("nobody@example.com")).toBeNull();
  });
});

describe("listUsers", () => {
  it("returns registered users newest-first, without secrets", async () => {
    await registerUser("alice@example.com", "password123");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await registerUser("bob@example.com", "password123");

    const users = await listUsers();

    expect(users.map((u) => u.email)).toEqual([
      "bob@example.com",
      "alice@example.com",
    ]);
    for (const user of users) {
      expect(user).not.toHaveProperty("passwordHash");
      expect(user).not.toHaveProperty("subscriptionUrl");
      expect(user.hasSubscriptionUrl).toBe(false);
    }
  });

  it("skips a corrupt user record", async () => {
    await registerUser("ok@example.com", "password123");
    redis.store.sets.get("auth:users:index")?.add("corrupt");
    redis.store.strings.set("auth:user:corrupt", "{bad");

    const users = await listUsers();

    expect(users.map((u) => u.email)).toEqual(["ok@example.com"]);
  });

  it("returns an empty array when there are no users", async () => {
    expect(await listUsers()).toEqual([]);
  });
});

describe("deleteUser", () => {
  it("removes the account, user index entry, and email reservation", async () => {
    const user = await registerUser("delete@example.com", "password123");
    await registerUser("keep@example.com", "password123");

    const deleted = await deleteUser(user.id);
    const users = await listUsers();

    expect(deleted.email).toBe("delete@example.com");
    expect(users.map((u) => u.email)).toEqual(["keep@example.com"]);
    await expect(
      registerUser("delete@example.com", "password123")
    ).resolves.toMatchObject({ email: "delete@example.com" });
  });

  it("rejects an unknown account", async () => {
    await expect(deleteUser("missing")).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("clears the Telegram index alongside the user record", async () => {
    const { user } = await loginOrRegisterByTelegram({
      telegramId: "1001",
      telegramUsername: "deleteme",
    });

    await deleteUser(user.id);

    expect(await getUserByTelegramId("1001")).toBeNull();
    // The Telegram id is now free to claim again — covers the "operator
    // wipes a test account and the user re-registers" path.
    const reborn = await loginOrRegisterByTelegram({
      telegramId: "1001",
      telegramUsername: "deleteme2",
    });
    expect(reborn.isNew).toBe(true);
  });
});

describe("loginOrRegisterByTelegram", () => {
  it("registers a new Telegram user immediately, with no invite gate", async () => {
    const { user, isNew } = await loginOrRegisterByTelegram({
      telegramId: "42",
      telegramUsername: "alice",
    });

    expect(isNew).toBe(true);
    expect(user.telegramId).toBe("42");
    expect(user.telegramUsername).toBe("alice");
    expect(user.email).toBeNull();
    expect(user.accessStatus).toBe("pending");
  });

  it("logs an existing Telegram user in on the second call", async () => {
    const first = await loginOrRegisterByTelegram({
      telegramId: "43",
      telegramUsername: "bob",
    });

    const second = await loginOrRegisterByTelegram({
      telegramId: "43",
      telegramUsername: "bob",
    });

    expect(second.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it("syncs the username when Telegram reports a new one", async () => {
    await loginOrRegisterByTelegram({
      telegramId: "44",
      telegramUsername: "old_name",
    });

    const updated = await loginOrRegisterByTelegram({
      telegramId: "44",
      telegramUsername: "new_name",
    });

    expect(updated.user.telegramUsername).toBe("new_name");
  });

  it("two parallel registrations from the same Telegram id: exactly one wins", async () => {
    const [a, b] = await Promise.allSettled([
      loginOrRegisterByTelegram({
        telegramId: "555",
        telegramUsername: "racer-a",
      }),
      loginOrRegisterByTelegram({
        telegramId: "555",
        telegramUsername: "racer-b",
      }),
    ]);

    const fulfilled = [a, b].filter((r) => r.status === "fulfilled");
    const rejected = [a, b].filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(
      (rejected[0] as PromiseRejectedResult).reason
    ).toMatchObject({ code: "telegram_id_taken" });
  });

  it("rolls back the Telegram reservation when saveUser fails", async () => {
    // Pass-through wrapper: fake-redis handles every command except the
    // user-record SET, which we force to fail to simulate a saveUser error.
    const original = globalThis.fetch;
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (url, init) => {
        const body = typeof init?.body === "string" ? init.body : "";
        const cmd = JSON.parse(body || "[]") as (string | number)[];
        if (String(cmd[0]).toUpperCase() === "SET" && String(cmd[1]).startsWith("auth:user:")) {
          throw new Error("simulated saveUser failure");
        }
        return original(url, init);
      });

    await expect(
      loginOrRegisterByTelegram({ telegramId: "404", telegramUsername: "rollback" })
    ).rejects.toThrow("simulated saveUser failure");

    fetchSpy.mockRestore();

    // Reservation rolled back — a retry for the same Telegram id must succeed.
    const ok = await loginOrRegisterByTelegram({
      telegramId: "404",
      telegramUsername: "rollback",
    });
    expect(ok.isNew).toBe(true);
  });
});

describe("getUserByTelegramId", () => {
  it("returns null when no user matches the Telegram id", async () => {
    expect(await getUserByTelegramId("nobody")).toBeNull();
  });

  it("returns the user for a known Telegram id", async () => {
    await loginOrRegisterByTelegram({
      telegramId: "777",
      telegramUsername: "lookup",
    });

    const found = await getUserByTelegramId("777");
    expect(found?.telegramUsername).toBe("lookup");
  });
});

describe("grantAccess by identifier", () => {
  it("still works with an email identifier (regression)", async () => {
    await registerUser("legacy@example.com", "password123");
    const granted = await grantAccess("legacy@example.com", {
      subscriptionUrl: "https://sub.example.com/legacy",
    });
    expect(granted.accessStatus).toBe("active");
  });

  it("resolves a numeric Telegram id", async () => {
    await loginOrRegisterByTelegram({
      telegramId: "12345",
      telegramUsername: "grantme",
    });

    const granted = await grantAccess("12345", {
      subscriptionUrl: "https://sub.example.com/tg",
    });
    expect(granted.accessStatus).toBe("active");
    expect(granted.telegramId).toBe("12345");
  });

  it("resolves an @username (case-insensitive)", async () => {
    await loginOrRegisterByTelegram({
      telegramId: "23456",
      telegramUsername: "GrantMeByName",
    });

    const granted = await grantAccess("@grantmebyname", {
      subscriptionUrl: "https://sub.example.com/name",
    });
    expect(granted.accessStatus).toBe("active");
    expect(granted.telegramUsername).toBe("GrantMeByName");
  });

  it("returns not_found for an unknown identifier of any shape", async () => {
    await expect(grantAccess("missing@example.com", {})).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(grantAccess("99999", {})).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(grantAccess("@ghost", {})).rejects.toMatchObject({
      code: "not_found",
    });
  });
});
