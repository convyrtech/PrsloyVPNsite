import { beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeRedis } from "./fake-redis";
import { getIndexedIds, kvSAdd, kvScanKeys } from "@/lib/kv";

const redis = installFakeRedis();

beforeEach(() => redis.reset());

describe("kvScanKeys", () => {
  it("returns matching keys and complete=true on a finished scan", async () => {
    redis.store.strings.set("auth:user:a", "{}");
    redis.store.strings.set("auth:user:b", "{}");
    redis.store.strings.set("other:x", "{}");

    const { keys, complete } = await kvScanKeys("auth:user:*");

    expect(complete).toBe(true);
    expect(keys.sort()).toEqual(["auth:user:a", "auth:user:b"]);
  });

  it("reports complete=false when the iteration cap is hit", async () => {
    redis.setScanCapped(true);
    redis.store.strings.set("auth:user:a", "{}");

    const { complete } = await kvScanKeys("auth:user:*");

    expect(complete).toBe(false);
  });
});

describe("getIndexedIds", () => {
  const params = {
    indexKey: "thing:index",
    keyPrefix: "thing:",
    syncFlagKey: "thing:index:synced",
    excludeKeys: ["thing:index", "thing:index:synced"],
  };

  it("backfills the index by SCAN on first run and sets the sync flag", async () => {
    redis.store.strings.set("thing:a", "{}");
    redis.store.strings.set("thing:b", "{}");

    const ids = await getIndexedIds(params);

    expect(ids.sort()).toEqual(["a", "b"]);
    expect(Array.from(redis.store.sets.get("thing:index") ?? []).sort()).toEqual([
      "a",
      "b",
    ]);
    expect(redis.store.strings.get("thing:index:synced")).toBe("1");
  });

  it("uses the index fast-path and skips SCAN once synced", async () => {
    redis.store.strings.set("thing:index:synced", "1");
    await kvSAdd("thing:index", "a");
    // present on disk but must be ignored because the scan is skipped
    redis.store.strings.set("thing:unindexed", "{}");

    expect(await getIndexedIds(params)).toEqual(["a"]);
  });

  it("excludes index and flag keys from discovered ids", async () => {
    redis.store.sets.set("thing:index", new Set());
    redis.store.strings.set("thing:real", "{}");

    expect(await getIndexedIds(params)).toEqual(["real"]);
  });

  it("withholds the sync flag when the SCAN is incomplete", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    redis.setScanCapped(true);
    redis.store.strings.set("thing:a", "{}");

    await getIndexedIds(params);

    expect(redis.store.strings.get("thing:index:synced")).toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
