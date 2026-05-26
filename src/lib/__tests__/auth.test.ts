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
  getCurrentUser,
  getUserByTelegramId,
  grantAccess,
  issueVerificationToken,
  listUsers,
  loginOrRegisterByTelegram,
  loginUser,
  registerUser,
  registerUserWithInvite,
  verifyEmailToken,
} from "@/lib/auth";
import { addInviteCodes, listAvailableCodes } from "@/lib/access-pool";

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

describe("registerUserWithInvite", () => {
  it("creates an account when a valid code is supplied", async () => {
    await addInviteCodes(["email-invite-1"]);
    const user = await registerUserWithInvite(
      "new@example.com",
      "password123",
      "email-invite-1"
    );
    expect(user.email).toBe("new@example.com");
    expect(user.accessStatus).toBe("pending");
    expect(await listAvailableCodes()).not.toContain("email-invite-1");
  });

  it("rejects when no invite code is supplied", async () => {
    await expect(
      registerUserWithInvite("no-code@example.com", "password123", "")
    ).rejects.toMatchObject({ code: "invite_required" });
  });

  it("rejects an unknown code with invite_invalid", async () => {
    await expect(
      registerUserWithInvite("ghost@example.com", "password123", "never-issued")
    ).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("rejects a previously-consumed code with invite_consumed", async () => {
    await addInviteCodes(["one-shot-email"]);
    await registerUserWithInvite(
      "first@example.com",
      "password123",
      "one-shot-email"
    );
    await expect(
      registerUserWithInvite(
        "second@example.com",
        "password123",
        "one-shot-email"
      )
    ).rejects.toMatchObject({ code: "invite_consumed" });
  });

  it("rolls back the email reservation when the code is bad", async () => {
    await expect(
      registerUserWithInvite("rollback@example.com", "password123", "bad-code")
    ).rejects.toMatchObject({ code: "invite_invalid" });
    // Email is free to register again with a valid code.
    await addInviteCodes(["rollback-ok"]);
    const ok = await registerUserWithInvite(
      "rollback@example.com",
      "password123",
      "rollback-ok"
    );
    expect(ok.email).toBe("rollback@example.com");
  });

  it("rejects duplicate email even with a valid code (no double registration)", async () => {
    await addInviteCodes(["first-code", "second-code"]);
    await registerUserWithInvite(
      "dup@example.com",
      "password123",
      "first-code"
    );
    await expect(
      registerUserWithInvite("dup@example.com", "password123", "second-code")
    ).rejects.toMatchObject({ code: "email_exists" });
    // The second code stays in the pool — duplicate-email check happens
    // before consume, so the code wasn't burned.
    expect(await listAvailableCodes()).toContain("second-code");
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
    await addInviteCodes(["tg-del-1"]);
    const { user } = await loginOrRegisterByTelegram({
      telegramId: "1001",
      telegramUsername: "deleteme",
      inviteCode: "tg-del-1",
    });

    await deleteUser(user.id);

    expect(await getUserByTelegramId("1001")).toBeNull();
    // The Telegram id is now free to claim again — covers the "operator
    // wipes a test account and the user re-registers" path.
    await addInviteCodes(["tg-del-2"]);
    const reborn = await loginOrRegisterByTelegram({
      telegramId: "1001",
      telegramUsername: "deleteme2",
      inviteCode: "tg-del-2",
    });
    expect(reborn.isNew).toBe(true);
  });
});

describe("loginOrRegisterByTelegram", () => {
  it("registers a new Telegram user when an unused code is supplied", async () => {
    await addInviteCodes(["new-tg-1"]);

    const { user, isNew } = await loginOrRegisterByTelegram({
      telegramId: "42",
      telegramUsername: "alice",
      inviteCode: "new-tg-1",
    });

    expect(isNew).toBe(true);
    expect(user.telegramId).toBe("42");
    expect(user.telegramUsername).toBe("alice");
    expect(user.email).toBeNull();
    expect(user.accessStatus).toBe("pending");
    expect(await listAvailableCodes()).toEqual([]);
  });

  it("logs an existing Telegram user in without an invite code", async () => {
    await addInviteCodes(["new-tg-2"]);
    const first = await loginOrRegisterByTelegram({
      telegramId: "43",
      telegramUsername: "bob",
      inviteCode: "new-tg-2",
    });

    const second = await loginOrRegisterByTelegram({
      telegramId: "43",
      telegramUsername: "bob",
    });

    expect(second.isNew).toBe(false);
    expect(second.user.id).toBe(first.user.id);
  });

  it("syncs the username when Telegram reports a new one", async () => {
    await addInviteCodes(["new-tg-3"]);
    await loginOrRegisterByTelegram({
      telegramId: "44",
      telegramUsername: "old_name",
      inviteCode: "new-tg-3",
    });

    const updated = await loginOrRegisterByTelegram({
      telegramId: "44",
      telegramUsername: "new_name",
    });

    expect(updated.user.telegramUsername).toBe("new_name");
  });

  it("rejects a returning-user shape that is actually new with no code", async () => {
    await expect(
      loginOrRegisterByTelegram({
        telegramId: "999",
        telegramUsername: null,
      })
    ).rejects.toMatchObject({ code: "invite_required" });
  });

  it("rejects a code that is not in the pool", async () => {
    await expect(
      loginOrRegisterByTelegram({
        telegramId: "888",
        telegramUsername: null,
        inviteCode: "never-issued",
      })
    ).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("rejects a previously-consumed code with invite_consumed (not invite_invalid)", async () => {
    await addInviteCodes(["once-only"]);
    // First user burns the code.
    await loginOrRegisterByTelegram({
      telegramId: "first",
      telegramUsername: null,
      inviteCode: "once-only",
    });
    // Second user with the same code — pool SREM returns 0, used-marker
    // exists, so the error must be invite_consumed (not invite_invalid).
    await expect(
      loginOrRegisterByTelegram({
        telegramId: "second",
        telegramUsername: null,
        inviteCode: "once-only",
      })
    ).rejects.toMatchObject({ code: "invite_consumed" });
  });

  it("rejects malformed invite codes via translated error", async () => {
    await expect(
      loginOrRegisterByTelegram({
        telegramId: "887",
        telegramUsername: null,
        inviteCode: "has space",
      })
    ).rejects.toMatchObject({ code: "invite_invalid" });
  });

  it("two parallel registrations from the same Telegram id: exactly one wins", async () => {
    await addInviteCodes(["race-1", "race-2"]);

    const [a, b] = await Promise.allSettled([
      loginOrRegisterByTelegram({
        telegramId: "555",
        telegramUsername: "racer-a",
        inviteCode: "race-1",
      }),
      loginOrRegisterByTelegram({
        telegramId: "555",
        telegramUsername: "racer-b",
        inviteCode: "race-2",
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

  it("rolls back the Telegram reservation when invite consume fails", async () => {
    // No codes in pool — every register attempt fails on consume.
    await expect(
      loginOrRegisterByTelegram({
        telegramId: "404",
        telegramUsername: "rollback",
        inviteCode: "never-existed",
      })
    ).rejects.toMatchObject({ code: "invite_invalid" });

    // Reservation rolled back — second attempt with valid code must succeed.
    await addInviteCodes(["rollback-ok"]);
    const ok = await loginOrRegisterByTelegram({
      telegramId: "404",
      telegramUsername: "rollback",
      inviteCode: "rollback-ok",
    });
    expect(ok.isNew).toBe(true);
  });
});

describe("getUserByTelegramId", () => {
  it("returns null when no user matches the Telegram id", async () => {
    expect(await getUserByTelegramId("nobody")).toBeNull();
  });

  it("returns the user for a known Telegram id", async () => {
    await addInviteCodes(["tg-lookup-1"]);
    await loginOrRegisterByTelegram({
      telegramId: "777",
      telegramUsername: "lookup",
      inviteCode: "tg-lookup-1",
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
    await addInviteCodes(["grant-tg-1"]);
    await loginOrRegisterByTelegram({
      telegramId: "12345",
      telegramUsername: "grantme",
      inviteCode: "grant-tg-1",
    });

    const granted = await grantAccess("12345", {
      subscriptionUrl: "https://sub.example.com/tg",
    });
    expect(granted.accessStatus).toBe("active");
    expect(granted.telegramId).toBe("12345");
  });

  it("resolves an @username (case-insensitive)", async () => {
    await addInviteCodes(["grant-tg-2"]);
    await loginOrRegisterByTelegram({
      telegramId: "23456",
      telegramUsername: "GrantMeByName",
      inviteCode: "grant-tg-2",
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
