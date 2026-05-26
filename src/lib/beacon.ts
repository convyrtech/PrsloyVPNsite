import { parseUtm } from "@/lib/analytics";

/* Browser-side pageview beacon helper.
   ───────────────────────────────────
   The dedupe state lives at module scope so it survives React
   StrictMode's intentional double-mount in dev: first mount fires
   the beacon and stores the path, second mount sees it cached and
   skips. A real navigation (different pathname or different query)
   always passes.

   A real page reload reloads the whole JS bundle, which resets the
   module variable, so reloads correctly count as a new pageview. */

let lastFiredKey: string | null = null;

function buildKey(pathname: string, search: string): string {
  return `${pathname}|${search}`;
}

// Operator pages live under /[locale]/admin/... — counting our own
// dashboard visits in the funnel pollutes the very numbers we read.
// Detect via the second URL segment so it works for any locale prefix
// (and any future locales added without touching this).
function isOperatorPath(pathname: string): boolean {
  const segments = pathname.split("/").filter(Boolean);
  return segments[1] === "admin";
}

export function sendBeacon(pathname: string, search: string): void {
  if (typeof fetch !== "function") return;

  const key = buildKey(pathname, search);
  if (lastFiredKey === key) return;
  // Update the dedupe slot even when we skip the fire — otherwise a
  // navigation /ru → /ru/admin → back to /ru would see the same
  // pre-admin key and dedupe-skip the legitimate revisit.
  lastFiredKey = key;
  if (isOperatorPath(pathname)) return;
  fireBeacon(pathname, search);
}

// bfcache restores reuse the React tree, so usePathname doesn't fire and
// the dedupe still holds the old key. Callers in that path (Beacon's
// pageshow handler) need to bypass the dedupe entirely.
export function sendBeaconForce(pathname: string, search: string): void {
  if (typeof fetch !== "function") return;
  lastFiredKey = buildKey(pathname, search);
  if (isOperatorPath(pathname)) return;
  fireBeacon(pathname, search);
}

function fireBeacon(pathname: string, search: string): void {
  const utm = parseUtm(search);
  const body: Record<string, string> = {
    name: "pageview",
    path: pathname,
  };
  if (utm.source) body.utmSource = utm.source;

  // keepalive lets the request outlive a page unmount (back/forward,
  // tab close) without being aborted by the browser. Errors are
  // intentionally swallowed: analytics must never break a navigation.
  void fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

// Exposed for tests only — production code never resets the dedupe.
export function __resetBeaconDedupeForTest(): void {
  lastFiredKey = null;
}
