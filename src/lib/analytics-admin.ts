import { kvMGet, kvSMembers, kvListRange } from "@/lib/kv";
import { envPrefix, todayKey, type AnalyticsEnv } from "@/lib/analytics";

/* Server-only admin views over the analytics counter keyspace.
   ───────────────────────────────────────────────────────────
   For a given date we read the index set written on every track()
   call, batch-MGET all its values in one round-trip, and bucket the
   keys by their kind segment (pv/utm/funnel/method). The capped event
   log is read on demand for raw inspection. */

export type AggregateRow = { label: string; count: number };
export type FunnelRow = { step: string; source: string; count: number };

export type DailyAggregate = {
  env: AnalyticsEnv;
  date: string;
  totalPageviews: number;
  totalRevenueRub: number;
  pageviews: AggregateRow[];
  utmSources: AggregateRow[];
  funnel: FunnelRow[];
  methods: AggregateRow[];
  // Revenue split by traffic source. `_total` is folded into
  // totalRevenueRub so it does not appear here.
  revenue: AggregateRow[];
};

function indexKeyFor(env: AnalyticsEnv, date: string): string {
  return `analytics:${env}:keys:${date}`;
}

function logKeyFor(env: AnalyticsEnv, date: string): string {
  return `analytics:${env}:log:${date}`;
}

/* Key shapes written by lib/analytics.ts:
     analytics:{env}:pv:{date}:{path}
     analytics:{env}:utm:{date}:{source}
     analytics:{env}:funnel:{date}:{step}:{source}
     analytics:{env}:method:{date}:{method}
   The :date: segment is informational duplication so reading a stray
   key gives self-contained context; the bucketing here uses the kind
   segment (index 2) and the trailing segments. */
function parseKey(
  key: string
):
  | { kind: "pv"; path: string }
  | { kind: "utm"; source: string }
  | { kind: "funnel"; step: string; source: string }
  | { kind: "method"; method: string }
  | { kind: "revenue"; source: string }
  | { kind: "revenue_total" }
  | null {
  const parts = key.split(":");
  // parts: ["analytics", env, kind, date, ...rest]
  if (parts.length < 4 || parts[0] !== "analytics") return null;
  const kind = parts[2];

  // revenue_total has no trailing source segment by design — keeps the
  // day-total cell out of the user-influenced key space, so a stray
  // utm_source value cannot collide with it.
  if (kind === "revenue_total") return { kind: "revenue_total" };

  if (parts.length < 5) return null;
  const rest = parts.slice(4).join(":");

  if (kind === "pv") return { kind: "pv", path: rest };
  if (kind === "utm") return { kind: "utm", source: rest };
  if (kind === "method") return { kind: "method", method: rest };
  if (kind === "revenue") return { kind: "revenue", source: rest };
  if (kind === "funnel") {
    const fp = rest.split(":");
    if (fp.length < 2) return null;
    return { kind: "funnel", step: fp[0], source: fp.slice(1).join(":") };
  }
  return null;
}

function sortRows(rows: AggregateRow[]): AggregateRow[] {
  return rows.sort((a, b) =>
    b.count !== a.count ? b.count - a.count : a.label.localeCompare(b.label)
  );
}

export async function readDailyAggregate(
  date: string = todayKey(),
  env: AnalyticsEnv = envPrefix()
): Promise<DailyAggregate> {
  const keys = await kvSMembers(indexKeyFor(env, date));
  const empty: DailyAggregate = {
    env,
    date,
    totalPageviews: 0,
    totalRevenueRub: 0,
    pageviews: [],
    utmSources: [],
    funnel: [],
    methods: [],
    revenue: [],
  };
  if (keys.length === 0) return empty;

  const values = await kvMGet(keys);
  const pv = new Map<string, number>();
  const utm = new Map<string, number>();
  const funnel: FunnelRow[] = [];
  const methods = new Map<string, number>();
  const revenue = new Map<string, number>();
  let totalPv = 0;
  let totalRevenue = 0;

  keys.forEach((key, i) => {
    const raw = values[i];
    if (!raw) return;
    const count = Number(raw);
    if (!Number.isFinite(count) || count <= 0) return;

    const parsed = parseKey(key);
    if (!parsed) return;

    switch (parsed.kind) {
      case "pv":
        pv.set(parsed.path, count);
        totalPv += count;
        break;
      case "utm":
        utm.set(parsed.source, count);
        break;
      case "funnel":
        funnel.push({ step: parsed.step, source: parsed.source, count });
        break;
      case "method":
        methods.set(parsed.method, count);
        break;
      case "revenue":
        revenue.set(parsed.source, count);
        break;
      case "revenue_total":
        totalRevenue = count;
        break;
    }
  });

  return {
    env,
    date,
    totalPageviews: totalPv,
    totalRevenueRub: totalRevenue,
    pageviews: sortRows(
      Array.from(pv.entries()).map(([label, count]) => ({ label, count }))
    ),
    utmSources: sortRows(
      Array.from(utm.entries()).map(([label, count]) => ({ label, count }))
    ),
    funnel: funnel.sort((a, b) =>
      b.count !== a.count
        ? b.count - a.count
        : `${a.step}:${a.source}`.localeCompare(`${b.step}:${b.source}`)
    ),
    methods: sortRows(
      Array.from(methods.entries()).map(([label, count]) => ({ label, count }))
    ),
    revenue: sortRows(
      Array.from(revenue.entries()).map(([label, count]) => ({ label, count }))
    ),
  };
}

export type RawEvent = {
  ts?: string;
  name?: string;
  [k: string]: unknown;
};

// Most recent N raw events for a date — the capped log was LPUSH'd, so
// the head of the list is the most recent event.
export async function readRecentEvents(
  date: string = todayKey(),
  limit = 50,
  env: AnalyticsEnv = envPrefix()
): Promise<RawEvent[]> {
  const raw = await kvListRange(logKeyFor(env, date), 0, limit - 1);
  return raw
    .map((entry): RawEvent | null => {
      try {
        return JSON.parse(entry) as RawEvent;
      } catch {
        return null;
      }
    })
    .filter((e): e is RawEvent => e !== null);
}
