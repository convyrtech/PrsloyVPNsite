import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";

// auth.ts imports next/headers at module load; it is never called here.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const redis = installFakeRedis();

beforeEach(() => redis.reset());

async function loadAuth() {
  return await import("@/lib/auth");
}

describe("listUsers", () => {
  it("returns registered users newest-first, without password hashes or raw config", async () => {
    const { registerUser, listUsers } = await loadAuth();
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
    const { registerUser, listUsers } = await loadAuth();
    await registerUser("ok@example.com", "password123");
    redis.store.sets.get("auth:users:index")?.add("corrupt");
    redis.store.strings.set("auth:user:corrupt", "{bad");

    const users = await listUsers();

    expect(users.map((u) => u.email)).toEqual(["ok@example.com"]);
  });

  it("returns an empty array when there are no users", async () => {
    const { listUsers } = await loadAuth();
    expect(await listUsers()).toEqual([]);
  });
});
