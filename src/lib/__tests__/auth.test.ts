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
  destroySession,
  getCurrentUser,
  grantAccess,
  issueVerificationToken,
  listUsers,
  loginUser,
  registerUser,
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
