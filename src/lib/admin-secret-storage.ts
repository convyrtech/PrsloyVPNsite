// Browser-only sessionStorage helpers for the admin secret. Used by the
// /admin/* client components so the secret is preserved across navigation
// within the same tab. sessionStorage clears on tab close, so the secret
// never outlives the operator's session.

const STORAGE_KEY = "prsloy_admin_secret";

export function getStoredAdminSecret(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function storeAdminSecret(secret: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, secret);
  } catch {
    // sessionStorage can throw in private mode or when quota is exceeded.
    // The form still works without persistence; nothing to do.
  }
}

export function clearStoredAdminSecret(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
