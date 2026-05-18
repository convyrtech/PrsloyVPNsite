type RedisValue = string | number;

type RedisResponse<T> = {
  result?: T;
  error?: string;
};

export class KvNotConfiguredError extends Error {
  constructor() {
    super("kv_not_configured");
    this.name = "KvNotConfiguredError";
  }
}

function getRedisEnv() {
  const url =
    process.env.KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_KV_REST_API_URL?.trim() ||
    process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token =
    process.env.KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN?.trim() ||
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    throw new KvNotConfiguredError();
  }

  return { url, token };
}

async function redisCommand<T>(command: RedisValue[]): Promise<T> {
  const { url, token } = getRedisEnv();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as RedisResponse<T> | null;

  if (!res.ok || data?.error) {
    throw new Error(data?.error || `redis_${res.status}`);
  }

  return data?.result as T;
}

export async function kvGet(key: string): Promise<string | null> {
  return await redisCommand<string | null>(["GET", key]);
}

export async function kvSet(
  key: string,
  value: string,
  options: { ex?: number; nx?: boolean } = {}
): Promise<boolean> {
  const command: RedisValue[] = ["SET", key, value];
  if (options.ex) command.push("EX", options.ex);
  if (options.nx) command.push("NX");
  const result = await redisCommand<string | null>(command);
  return result === "OK";
}

export async function kvDel(key: string): Promise<void> {
  await redisCommand<number>(["DEL", key]);
}

export async function kvSAdd(key: string, member: string): Promise<number> {
  return await redisCommand<number>(["SADD", key, member]);
}

export async function kvSRem(key: string, member: string): Promise<void> {
  await redisCommand<number>(["SREM", key, member]);
}

export async function kvSMembers(key: string): Promise<string[]> {
  const result = await redisCommand<string[] | null>(["SMEMBERS", key]);
  return Array.isArray(result) ? result : [];
}

export async function kvScanKeys(
  pattern: string,
  count = 100
): Promise<{ keys: string[]; complete: boolean }> {
  const keys = new Set<string>();
  let cursor = "0";
  let iterations = 0;

  do {
    const result = await redisCommand<[string | number, string[]]>([
      "SCAN",
      cursor,
      "MATCH",
      pattern,
      "COUNT",
      count,
    ]);
    cursor = String(result?.[0] ?? "0");
    for (const key of result?.[1] ?? []) {
      keys.add(key);
    }
    iterations += 1;
  } while (cursor !== "0" && iterations < 100);

  // complete=false means the 100-iteration safety cap was hit before the
  // cursor finished — results are partial and callers must not treat them
  // as the full keyspace.
  return { keys: Array.from(keys), complete: cursor === "0" };
}

export async function kvListPushCapped(
  key: string,
  value: string,
  cap: number
): Promise<void> {
  await redisCommand<number>(["LPUSH", key, value]);
  await redisCommand<string>(["LTRIM", key, 0, cap - 1]);
}

export async function kvListRange(
  key: string,
  start: number,
  stop: number
): Promise<string[]> {
  const result = await redisCommand<string[] | null>(["LRANGE", key, start, stop]);
  return Array.isArray(result) ? result : [];
}

/* One source of truth for an "index set + lazy SCAN backfill" collection.
   ─────────────────────────────────────────────────────────────────────
   sync flag set   ─> SMEMBERS index                          (fast path)
   sync flag unset ─> SCAN keyPrefix* ─> SADD stragglers to index
                      ├ scan complete ─> set sync flag
                      └ scan capped   ─> warn, leave flag unset (retry) */
export async function getIndexedIds(params: {
  indexKey: string;
  keyPrefix: string;
  syncFlagKey: string;
  excludeKeys: string[];
}): Promise<string[]> {
  const { indexKey, keyPrefix, syncFlagKey, excludeKeys } = params;

  if (await kvGet(syncFlagKey)) {
    return await kvSMembers(indexKey);
  }

  const indexed = await kvSMembers(indexKey);
  const { keys, complete } = await kvScanKeys(`${keyPrefix}*`);
  const discovered = keys
    .filter((key) => key.startsWith(keyPrefix) && !excludeKeys.includes(key))
    .map((key) => key.slice(keyPrefix.length))
    .filter(Boolean);

  // Reindex stragglers so the fast path works on the next call.
  await Promise.all(
    discovered.map(async (id) => {
      try {
        await kvSAdd(indexKey, id);
      } catch (err) {
        console.warn("[kv] reindex failed", indexKey, id, err);
      }
    })
  );

  if (complete) {
    await kvSet(syncFlagKey, "1");
  } else {
    console.warn("[kv] scan incomplete, backfill flag withheld", `${keyPrefix}*`);
  }

  return Array.from(new Set([...indexed, ...discovered]));
}

/* Atomic fixed-window counter: INCR, set the TTL on the first hit, report
   the current count and remaining seconds in one round-trip. */
const RATE_LIMIT_SCRIPT = [
  "local c = redis.call('INCR', KEYS[1])",
  "if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end",
  "local t = redis.call('TTL', KEYS[1])",
  "return {c, t}",
].join(" ");

export async function kvRateLimit(
  key: string,
  windowSeconds: number
): Promise<{ count: number; ttl: number }> {
  const result = await redisCommand<[number, number]>([
    "EVAL",
    RATE_LIMIT_SCRIPT,
    1,
    key,
    windowSeconds,
  ]);
  const [count, ttl] = Array.isArray(result) ? result : [0, 0];
  return { count, ttl };
}
