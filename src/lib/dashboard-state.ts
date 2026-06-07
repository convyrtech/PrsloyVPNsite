import type { PublicAuthUser } from "@/lib/auth";

export type DashboardState =
  | { kind: "loading" }
  | { kind: "not_configured" }
  | { kind: "ready"; user: PublicAuthUser | null };

type MeResponse = {
  ok?: boolean;
  user?: PublicAuthUser | null;
  error?: string;
};

// Maps an /api/auth/me response to the next dashboard state.
//
// The load-bearing rule: only an AUTHORITATIVE ok response (resOk && data.ok)
// may surface the guest sign-in screen (user: null). Any other non-ok response
// — `me_failed`/`kv_unavailable`/5xx when KV is reachable-but-erroring — is a
// BACKEND failure, NOT "signed out", and must never downgrade a possibly
// logged-in (possibly paying) user to the guest screen: doing so reads as
// "your account/payment vanished" and drives refund/chargeback anxiety under
// load. We reuse the `not_configured` panel, whose copy already reads
// "temporarily unavailable, try again". On a refetch we keep whatever data we
// already have; only the initial load shows the panel.
export function resolveMeState(
  prev: DashboardState,
  resOk: boolean,
  data: MeResponse
): DashboardState {
  if (
    data.error === "auth_not_configured" ||
    data.error === "kv_not_configured" ||
    data.error === "auth_secret_not_configured"
  ) {
    return { kind: "not_configured" };
  }
  if (resOk && data.ok) {
    return { kind: "ready", user: data.user ?? null };
  }
  return prev.kind === "loading" ? { kind: "not_configured" } : prev;
}
