/* Browser-side utm_source threading.
   ─────────────────────────────────
   The user lands on /ru?utm_source=telegram, then clicks through to
   /ru/register where the URL no longer carries utm_source. Without
   persistence the form has no way to attribute its register_success
   event to telegram.

   We stash the source in sessionStorage instead of a cookie so it is
   tab-scoped and clears on close — never crosses sessions, never a
   tracking cookie. Forms read it on submit; if storage is unavailable
   (private mode, sandboxed iframe) the read falls back to the current
   URL, which still works for direct landings.

   Nothing here ever leaves the browser without an explicit form submit.
   The server-side analytics lib never sees this key. */

const STORAGE_KEY = "prsloy_utm_source";
const MAX_LEN = 80;

function normalize(value: string): string | undefined {
  const trimmed = value.trim().slice(0, MAX_LEN);
  return trimmed ? trimmed : undefined;
}

export function captureUtmFromUrl(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const source = new URLSearchParams(window.location.search).get("utm_source");
  if (!source) return undefined;
  const value = normalize(source);
  if (!value) return undefined;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Private mode / sandboxed iframe — captureUtm becomes a no-op,
    // readUtmSource falls back to the URL.
  }
  return value;
}

export function readUtmSource(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const value = normalize(stored);
      if (value) return value;
    }
  } catch {
    // Fall through to URL read.
  }
  const fromUrl = new URLSearchParams(window.location.search).get("utm_source");
  return fromUrl ? normalize(fromUrl) : undefined;
}

export function __resetClientUtmForTest(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
