import { kvGet, kvIncr } from "@/lib/kv";

/* Capacity counter.
   ─────────────────
   Lifetime, monotonic. Incremented once per order at first confirmation
   (idempotent against Platega retry callbacks via the confirmedAt guard
   in updatePaymentByTransaction). Never decrements — churn does not
   release a slot in the displayed total; the model is "300 paying
   customers ever during this milestone" rather than snapshot active.

   KV:
     access:paying:count     INTEGER (kvIncr)
*/

const PAYING_COUNTER_KEY = "access:paying:count";
const DEFAULT_TARGET = 300;
const DEFAULT_OFFSET = 47;

export type Capacity = {
  paying: number; // real INCR'd value
  target: number; // milestone goal
  offset: number; // marketing offset (display starts above zero)
  display: number; // paying + offset — what /pricing shows
  full: boolean; // display >= target
  remaining: number; // target - display, clamped to ≥0
  expansionAtIso: string; // ISO date for the pool-full countdown timer
  vipContactUrl: string; // "Don't want to wait" → personal Telegram
};

function safeIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
}

// Two weeks from "now" if not configured — feels real, gives FOMO without
// committing to a date the operator forgot to update. Set NEXT_EXPANSION_AT
// to an ISO date string (e.g. 2026-06-10T00:00:00Z) when you know the
// real planned expansion. The timer ticks live; once it hits 0 it shows
// the "expired" copy and you bump the env.
function getExpansionAt(): string {
  const fromEnv = process.env.NEXT_EXPANSION_AT?.trim();
  if (fromEnv) return fromEnv;
  const fallback = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return fallback.toISOString();
}

function getVipContactUrl(): string {
  return (
    process.env.NEXT_PUBLIC_VIP_CONTACT_URL?.trim() ||
    process.env.VIP_CONTACT_URL?.trim() ||
    "https://t.me/prsloy" // safe fallback
  );
}

export async function incrementPayingCounter(): Promise<number> {
  return await kvIncr(PAYING_COUNTER_KEY);
}

export async function getCapacity(): Promise<Capacity> {
  const raw = await kvGet(PAYING_COUNTER_KEY);
  const paying = raw ? Number(raw) : 0;
  const safePaying = Number.isFinite(paying) ? Math.max(0, paying) : 0;
  const target = safeIntEnv("PRICING_TARGET", DEFAULT_TARGET);
  const offset = safeIntEnv("PRICING_COUNTER_OFFSET", DEFAULT_OFFSET);
  const display = safePaying + offset;
  return {
    paying: safePaying,
    target,
    offset,
    display,
    full: display >= target,
    remaining: Math.max(0, target - display),
    expansionAtIso: getExpansionAt(),
    vipContactUrl: getVipContactUrl(),
  };
}
