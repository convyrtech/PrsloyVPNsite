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

export async function kvSMembers(key: string): Promise<string[]> {
  const result = await redisCommand<string[] | null>(["SMEMBERS", key]);
  return Array.isArray(result) ? result : [];
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
