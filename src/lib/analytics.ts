import { isbot } from "isbot";
import {
  kvExpire,
  kvIncr,
  kvIncrBy,
  kvListPushCapped,
  kvSAdd,
  KvNotConfiguredError,
} from "@/lib/kv";

/* In-house analytics — counter-first, log-as-safety-net.
   ──────────────────────────────────────────────────────
   - track() is fire-and-forget: never throws, never blocks the caller.
   - Counter keys are namespaced by environment so dev/preview hits do
     not pollute production aggregates.
   - A per-date index (analytics:{env}:keys:{date}) records every key
     we've written today, so the admin dashboard can read totals via
     SMEMBERS + batched MGET instead of an open SCAN.
   - A per-date capped log (LPUSH+LTRIM to 10k) keeps the last raw
     events as a fallback when a counter alone cannot answer a question
     (e.g. "did this UTM source actually convert?"). */

const COUNTER_TTL_SECONDS = 60 * 60 * 24 * 90; // 90 days
const LOG_CAP = 10_000;

export type AnalyticsEvent =
  | { name: "pageview"; path: string; utmSource?: string }
  | { name: "register_success"; userId: string; utmSource?: string }
  | {
      name: "payment_started";
      orderId: string;
      method: string;
      utmSource?: string;
    }
  | {
      name: "payment_confirmed";
      orderId: string;
      amountRub: number;
      utmSource?: string;
    }
  | { name: "key_issued"; userId: string }
  // Auto-issue failed after a confirmed payment — every occurrence is a
  // paid buyer without a key until the operator recovers the order.
  | { name: "issue_failed"; orderId: string };

export type AnalyticsEnv = "prod" | "preview" | "dev";

export function envPrefix(): AnalyticsEnv {
  const vercelEnv = process.env.VERCEL_ENV?.trim();
  if (vercelEnv === "production") return "prod";
  if (vercelEnv === "preview") return "preview";
  // Local dev (`npm run dev`) and tests both land here.
  return "dev";
}

/* Sanitize a UTM/path segment for safe use as a KV key suffix.
   Strips whitespace and characters that would make the resulting key
   ambiguous or hard to read in the admin (`:`, `*`, control chars).
   Caps length to avoid pathological URLs ballooning the keyspace. */
export function sanitizeKeyPart(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s:*?[\]\\]+/g, "_")
    .replace(/[^a-z0-9._\-/]+/g, "_")
    .slice(0, 80);
}

export type Utm = {
  source?: string;
  medium?: string;
  campaign?: string;
};

/* Pulls utm_* from a URL or a raw query string.
   Returns undefined on every field whose value is empty after sanitize. */
export function parseUtm(input: string): Utm {
  let search: string;
  try {
    search = new URL(input, "http://placeholder.invalid").search;
  } catch {
    search = input.startsWith("?") ? input : `?${input}`;
  }

  const params = new URLSearchParams(search);
  const pick = (key: string): string | undefined => {
    const raw = params.get(key);
    if (!raw) return undefined;
    const clean = sanitizeKeyPart(raw);
    return clean ? clean : undefined;
  };

  return {
    source: pick("utm_source"),
    medium: pick("utm_medium"),
    campaign: pick("utm_campaign"),
  };
}

export function isBotUA(userAgent: string | null | undefined): boolean {
  if (!userAgent) return true; // missing UA is overwhelmingly bots
  return isbot(userAgent);
}

// Counters pivot on Moscow time so the day boundary lines up with the
// operator's intuition — UTC would leave the first three hours of an
// MSK day attributed to "yesterday" in the admin view, which is
// confusing during a launch night. The bucketing is operator-local, the
// log timestamp stays UTC ISO.
const COUNTER_TZ = "Europe/Moscow";
const COUNTER_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: COUNTER_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayKey(now: Date = new Date()): string {
  // en-CA gives "YYYY-MM-DD" directly, no manual parts-assembly needed.
  return COUNTER_DATE_FORMATTER.format(now);
}

function buildKey(env: AnalyticsEnv, ...parts: string[]): string {
  return ["analytics", env, ...parts].join(":");
}

async function bumpCounter(
  env: AnalyticsEnv,
  date: string,
  suffix: string
): Promise<void> {
  const key = buildKey(env, suffix);
  const indexKey = buildKey(env, "keys", date);
  await kvIncr(key);
  // Best-effort: index the key for the admin dashboard, then put TTLs on
  // both so abandoned dimensions roll off after 90 days.
  await Promise.allSettled([
    kvSAdd(indexKey, key),
    kvExpire(key, COUNTER_TTL_SECONDS),
    kvExpire(indexKey, COUNTER_TTL_SECONDS),
  ]);
}

// Same shape as bumpCounter but adds an arbitrary amount instead of +1.
// Used for revenue accumulation on payment_confirmed.
async function bumpRevenue(
  env: AnalyticsEnv,
  date: string,
  suffix: string,
  amount: number
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0) return;
  const key = buildKey(env, suffix);
  const indexKey = buildKey(env, "keys", date);
  await kvIncrBy(key, amount);
  await Promise.allSettled([
    kvSAdd(indexKey, key),
    kvExpire(key, COUNTER_TTL_SECONDS),
    kvExpire(indexKey, COUNTER_TTL_SECONDS),
  ]);
}

async function appendLog(
  env: AnalyticsEnv,
  date: string,
  event: AnalyticsEvent
): Promise<void> {
  const key = buildKey(env, "log", date);
  const payload = JSON.stringify({ ts: new Date().toISOString(), ...event });
  await kvListPushCapped(key, payload, LOG_CAP);
  await kvExpire(key, COUNTER_TTL_SECONDS);
}

/* Resolve UTM source for the event. Direct hits (no UTM) are bucketed
   under "direct" so the admin always sees a complete source breakdown. */
function utmSourceOf(event: AnalyticsEvent): string {
  if ("utmSource" in event && event.utmSource) {
    return sanitizeKeyPart(event.utmSource);
  }
  return "direct";
}

// Emergency lever to shed the high-volume pageview KV writes without a deploy
// (see the pageview case in track). Off by default.
function pageviewWritesDisabled(): boolean {
  const v = process.env.ANALYTICS_DISABLED;
  return v === "1" || v === "true";
}

export async function track(event: AnalyticsEvent): Promise<void> {
  const env = envPrefix();
  const date = todayKey();
  const source = utmSourceOf(event);

  try {
    switch (event.name) {
      case "pageview": {
        // Emergency kill-switch. The per-path counter + the per-hit log line
        // are ~all of the analytics KV load; a single ad spike can exhaust an
        // Upstash quota and start failing auth/payment writes. Set
        // ANALYTICS_DISABLED=1 in env to shed those heavy writes WITHOUT a deploy.
        //
        // The single per-source visit counter is bumped FIRST and kept even when
        // disabled: it is the denominator for cost-per-click and per-source
        // conversion — exactly the number you cannot lose during the spike that
        // makes you flip the switch. One cheap INCR survives; the unbounded
        // per-path counter and the per-hit log (shed by the `return`) do not.
        await bumpCounter(env, date, `utm:${date}:${source}`);
        if (pageviewWritesDisabled()) return;
        const path = sanitizeKeyPart(event.path) || "_";
        await bumpCounter(env, date, `pv:${date}:${path}`);
        break;
      }
      case "register_success":
        await bumpCounter(env, date, `funnel:${date}:register:${source}`);
        break;
      case "payment_started":
        await bumpCounter(
          env,
          date,
          `funnel:${date}:payment_started:${source}`
        );
        await bumpCounter(env, date, `method:${date}:${sanitizeKeyPart(event.method)}`);
        break;
      case "payment_confirmed":
        await bumpCounter(env, date, `funnel:${date}:payment:${source}`);
        // Revenue: total across the day AND per-source split so the admin
        // can answer both "how much earned today" and "how much from tg".
        //
        // Total uses a distinct `revenue_total` kind segment (no source
        // suffix) — users cannot produce a kind segment via sanitizeKeyPart,
        // so a malicious or unlucky utm_source can never collide with the
        // day-total key (e.g. ?utm_source=_total would otherwise hit the
        // same cell as the reserved total bucket).
        await bumpRevenue(env, date, `revenue_total:${date}`, event.amountRub);
        await bumpRevenue(
          env,
          date,
          `revenue:${date}:${source}`,
          event.amountRub
        );
        break;
      case "key_issued":
        await bumpCounter(env, date, `funnel:${date}:key:_`);
        break;
    }
    await appendLog(env, date, event);
  } catch (err) {
    // Analytics is best-effort: a KV outage must not break user flows or
    // leak into webhook responses. Log so it shows up in Vercel runtime
    // logs, then swallow.
    if (err instanceof KvNotConfiguredError) {
      // Don't spam the logs in local dev when KV is not configured.
      return;
    }
    console.warn("[analytics] track failed", event.name, err);
  }
}
