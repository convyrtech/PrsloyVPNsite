import { describe, it, expect } from "vitest";
import { resolveMeState, type DashboardState } from "@/lib/dashboard-state";
import type { PublicAuthUser } from "@/lib/auth";

const loading: DashboardState = { kind: "loading" };
const user = { id: "u1" } as unknown as PublicAuthUser;

describe("resolveMeState", () => {
  it("shows the unavailable panel (NOT the guest screen) on a backend error during initial load", () => {
    // The regression: a KV-down 500 used to fall through to { ready, user: null }
    // and render the guest 'sign in' screen to a logged-in user.
    const next = resolveMeState(loading, false, { ok: false, error: "me_failed" });
    expect(next.kind).toBe("not_configured");
  });

  it("treats a transient kv_unavailable (503) the same — never 'signed out'", () => {
    const next = resolveMeState(loading, false, { ok: false, error: "kv_unavailable" });
    expect(next.kind).toBe("not_configured");
  });

  it("keeps prior data on a backend error during a refetch (no downgrade)", () => {
    const prev: DashboardState = { kind: "ready", user };
    const next = resolveMeState(prev, false, { ok: false, error: "me_failed" });
    expect(next).toBe(prev);
  });

  it("shows the guest screen ONLY on an authoritative ok response with no user", () => {
    const next = resolveMeState(loading, true, { ok: true, user: null });
    expect(next).toEqual({ kind: "ready", user: null });
  });

  it("renders the user on an authoritative ok response", () => {
    const next = resolveMeState(loading, true, { ok: true, user });
    expect(next).toEqual({ kind: "ready", user });
  });

  it("maps explicit not-configured codes to the not_configured panel", () => {
    for (const error of [
      "auth_not_configured",
      "kv_not_configured",
      "auth_secret_not_configured",
    ]) {
      expect(resolveMeState(loading, false, { ok: false, error }).kind).toBe(
        "not_configured"
      );
    }
  });
});
