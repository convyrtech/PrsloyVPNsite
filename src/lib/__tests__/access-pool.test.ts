import { beforeEach, describe, expect, it } from "vitest";
import { installFakeRedis } from "./fake-redis";
import {
  AccessPoolError,
  addInviteCodes,
  consumeInviteCode,
  getCodeUsage,
  listAvailableCodes,
} from "@/lib/access-pool";

const redis = installFakeRedis();

beforeEach(() => redis.reset());

describe("addInviteCodes", () => {
  it("adds new codes to the pool and reports counts", async () => {
    const result = await addInviteCodes(["alpha", "bravo", "charlie"]);

    expect(result).toEqual({ added: 3, skipped: 0 });
    expect((await listAvailableCodes()).sort()).toEqual([
      "alpha",
      "bravo",
      "charlie",
    ]);
  });

  it("skips codes already present in the pool", async () => {
    await addInviteCodes(["alpha"]);

    const result = await addInviteCodes(["alpha", "bravo"]);

    expect(result).toEqual({ added: 1, skipped: 1 });
  });

  it("skips codes already marked used", async () => {
    await addInviteCodes(["alpha"]);
    await consumeInviteCode("alpha", "user:abc");

    const result = await addInviteCodes(["alpha", "bravo"]);

    expect(result).toEqual({ added: 1, skipped: 1 });
    expect(await listAvailableCodes()).toEqual(["bravo"]);
  });

  it("trims whitespace and deduplicates within a single call", async () => {
    const result = await addInviteCodes(["  alpha  ", "alpha", " bravo "]);

    expect(result).toEqual({ added: 2, skipped: 1 });
    expect((await listAvailableCodes()).sort()).toEqual(["alpha", "bravo"]);
  });

  it("rejects empty input", async () => {
    await expect(addInviteCodes([])).rejects.toBeInstanceOf(AccessPoolError);
  });

  it("rejects codes outside the allowed alphabet", async () => {
    await expect(addInviteCodes(["bad code"])).rejects.toBeInstanceOf(
      AccessPoolError
    );
    await expect(addInviteCodes(["with/slash"])).rejects.toBeInstanceOf(
      AccessPoolError
    );
  });

  it("rejects codes that are too short or too long", async () => {
    await expect(addInviteCodes([""])).rejects.toBeInstanceOf(AccessPoolError);
    await expect(
      addInviteCodes(["x".repeat(129)])
    ).rejects.toBeInstanceOf(AccessPoolError);
  });
});

describe("consumeInviteCode", () => {
  it("returns true and removes the code on first consume", async () => {
    await addInviteCodes(["alpha"]);

    const ok = await consumeInviteCode("alpha", "user:abc");

    expect(ok).toBe(true);
    expect(await listAvailableCodes()).toEqual([]);
    expect(await getCodeUsage("alpha")).toBe("user:abc");
  });

  it("returns false on a second consume of the same code (race-loser path)", async () => {
    await addInviteCodes(["alpha"]);
    await consumeInviteCode("alpha", "user:first");

    const second = await consumeInviteCode("alpha", "user:second");

    expect(second).toBe(false);
    // Owner label stays with the winner; the loser must not overwrite it.
    expect(await getCodeUsage("alpha")).toBe("user:first");
  });

  it("returns false for codes that never existed", async () => {
    expect(await consumeInviteCode("ghost", "user:abc")).toBe(false);
    expect(await getCodeUsage("ghost")).toBeNull();
  });

  it("rejects malformed code input", async () => {
    await expect(consumeInviteCode("", "user:abc")).rejects.toBeInstanceOf(
      AccessPoolError
    );
    await expect(
      consumeInviteCode("with space", "user:abc")
    ).rejects.toBeInstanceOf(AccessPoolError);
  });

  it("rejects empty owner label", async () => {
    await addInviteCodes(["alpha"]);
    await expect(consumeInviteCode("alpha", "")).rejects.toBeInstanceOf(
      AccessPoolError
    );
  });

  it("two parallel consumers of the same code: exactly one wins", async () => {
    await addInviteCodes(["alpha"]);

    const [a, b] = await Promise.all([
      consumeInviteCode("alpha", "user:a"),
      consumeInviteCode("alpha", "user:b"),
    ]);

    // SREM is atomic in the fake store too — exactly one returns 1.
    expect([a, b].filter(Boolean)).toHaveLength(1);
    expect(await listAvailableCodes()).toEqual([]);
  });
});

describe("listAvailableCodes", () => {
  it("returns empty when pool is empty", async () => {
    expect(await listAvailableCodes()).toEqual([]);
  });

  it("excludes consumed codes", async () => {
    await addInviteCodes(["alpha", "bravo"]);
    await consumeInviteCode("alpha", "user:a");

    expect(await listAvailableCodes()).toEqual(["bravo"]);
  });
});

describe("getCodeUsage", () => {
  it("returns null for never-issued codes", async () => {
    expect(await getCodeUsage("ghost")).toBeNull();
  });

  it("returns null for codes still in the pool", async () => {
    await addInviteCodes(["alpha"]);
    expect(await getCodeUsage("alpha")).toBeNull();
  });

  it("returns the owner label after consume", async () => {
    await addInviteCodes(["alpha"]);
    await consumeInviteCode("alpha", "operator:claude");

    expect(await getCodeUsage("alpha")).toBe("operator:claude");
  });
});
