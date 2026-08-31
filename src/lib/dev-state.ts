/**
 * Dev-only state forcing for pre-flight visual checks.
 *
 * Many UI states (blocked, paid-awaiting, issue-failed, each auth error, …)
 * can't be reached on the dev server because it has no KV / auth / payment,
 * and prod sits behind a WAF that blocks automated browsers. These helpers let
 * a human force a state via a query flag during local review — e.g.
 *   /ru/dashboard?__state=active
 *   /ru/dashboard?__state=paid-awaiting
 *   /ru/register?__error=email_exists
 *
 * HARD GUARANTEE: inert in production. The guard short-circuits to null when
 * NODE_ENV === "production" or there is no `window`, so no production bundle
 * ever honours a `?__state=` flag. See dev-state.test.ts.
 */
export function getDevState(key: string): string | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined") return null;
  try {
    return new URLSearchParams(window.location.search).get(key);
  } catch {
    return null;
  }
}

/** Convenience: the forced page-state, e.g. ?__state=active. */
export function getForcedState(): string | null {
  return getDevState("__state");
}

/** Convenience: the forced error code, e.g. ?__error=email_exists. */
export function getForcedError(): string | null {
  return getDevState("__error");
}
