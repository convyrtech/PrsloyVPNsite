import { vi } from "vitest";

/* In-memory Upstash-REST stand-in for tests.
   ──────────────────────────────────────────
   Stubs global fetch so the real KV code (redisCommand → fetch) runs
   end-to-end against an in-memory store. Supports only the commands the
   code under test issues. */

type Store = {
  strings: Map<string, string>;
  sets: Map<string, Set<string>>;
  lists: Map<string, string[]>;
};

export type FakeRedis = {
  store: Store;
  reset: () => void;
  setScanCapped: (capped: boolean) => void;
};

function matchesGlob(pattern: string, key: string): boolean {
  // The code only ever uses `prefix*` patterns.
  if (pattern.endsWith("*")) return key.startsWith(pattern.slice(0, -1));
  return key === pattern;
}

function sliceRange(list: string[], start: number, stop: number): string[] {
  const end = stop < 0 ? list.length + stop + 1 : stop + 1;
  return list.slice(start < 0 ? Math.max(0, list.length + start) : start, end);
}

export function installFakeRedis(): FakeRedis {
  process.env.KV_REST_API_URL = "http://fake-redis.test";
  process.env.KV_REST_API_TOKEN = "fake-token";

  const store: Store = {
    strings: new Map(),
    sets: new Map(),
    lists: new Map(),
  };
  let scanCapped = false;

  function run(cmd: (string | number)[]): unknown {
    const op = String(cmd[0]).toUpperCase();
    const key = String(cmd[1]);

    switch (op) {
      case "GET":
        return store.strings.get(key) ?? null;
      case "SET": {
        const opts = cmd.slice(3).map((x) => String(x).toUpperCase());
        const exists =
          store.strings.has(key) || store.sets.has(key) || store.lists.has(key);
        if (opts.includes("NX") && exists) return null;
        store.strings.set(key, String(cmd[2]));
        return "OK";
      }
      case "DEL": {
        const had =
          store.strings.delete(key) ||
          store.sets.delete(key) ||
          store.lists.delete(key);
        return had ? 1 : 0;
      }
      case "SADD": {
        const set = store.sets.get(key) ?? new Set<string>();
        const member = String(cmd[2]);
        const isNew = !set.has(member);
        set.add(member);
        store.sets.set(key, set);
        return isNew ? 1 : 0;
      }
      case "SREM": {
        const set = store.sets.get(key);
        return set && set.delete(String(cmd[2])) ? 1 : 0;
      }
      case "SMEMBERS":
        return Array.from(store.sets.get(key) ?? []);
      case "SCAN": {
        const cursor = String(cmd[1]);
        const matchIdx = cmd.findIndex((x) => String(x).toUpperCase() === "MATCH");
        const pattern = matchIdx >= 0 ? String(cmd[matchIdx + 1]) : "*";
        const keys = [
          ...store.strings.keys(),
          ...store.sets.keys(),
          ...store.lists.keys(),
        ].filter((k) => matchesGlob(pattern, k));
        // Capped mode never hands back the "0" terminator cursor.
        if (scanCapped) return ["1", keys];
        return cursor === "0" ? ["0", keys] : ["0", []];
      }
      case "LPUSH": {
        const list = store.lists.get(key) ?? [];
        list.unshift(String(cmd[2]));
        store.lists.set(key, list);
        return list.length;
      }
      case "LTRIM": {
        const list = store.lists.get(key) ?? [];
        store.lists.set(key, sliceRange(list, Number(cmd[2]), Number(cmd[3])));
        return "OK";
      }
      case "LRANGE":
        return sliceRange(store.lists.get(key) ?? [], Number(cmd[2]), Number(cmd[3]));
      default:
        throw new Error(`fake-redis: unsupported command ${op}`);
    }
  }

  vi.stubGlobal("fetch", async (_url: unknown, init?: { body?: string }) => {
    const cmd = JSON.parse(init?.body ?? "[]") as (string | number)[];
    return new Response(JSON.stringify({ result: run(cmd) }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  return {
    store,
    reset: () => {
      store.strings.clear();
      store.sets.clear();
      store.lists.clear();
      scanCapped = false;
    },
    setScanCapped: (capped) => {
      scanCapped = capped;
    },
  };
}
