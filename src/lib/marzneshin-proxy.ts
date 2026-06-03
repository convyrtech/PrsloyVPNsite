import { createHmac } from "crypto";
import { kvGet, kvSet, KvNotConfiguredError } from "@/lib/kv";
import { type Period } from "@/lib/pricing";

/* Marzneshin proxy client.
   ───────────────────────
   PRSLOY does NOT call Marzneshin directly — its API is bound to 127.0.0.1
   on the partner's server (Hellcat backend) and is not publicly exposed.
   Instead we call a thin HMAC-signed endpoint on the partner's backend,
   which uses its existing marz.py client to create/extend users.

   Contract (partner-side endpoint `POST /external/issue-key`):
     Headers:
       Content-Type: application/json
       X-PRSLOY-Signature: hex(HMAC-SHA256(body, MARZNESHIN_PROXY_HMAC_SECRET))
     Body:
       { payment_id, period_days, prsloy_user_id, email }
     200 OK (new issue) | 409 Conflict (idempotent replay) — both return:
       { marz_username, subscription_url }
     401 Unauthorized — bad signature
     400 Bad Request — malformed input
     5xx — partner backend / Marzneshin down

   Idempotency boundary on partner side: `payment_id`. Replay returns the
   previously-issued record with 409; we treat it as success-equivalent and
   move on. The caller in payments.ts is already guarded by the
   wasFirstConfirmation + NX-set emit gate, so 409 here is only seen if a
   late retry slips through.

   Spec source: prsloy-infra/marzneshin-api-spec.md (recon 2026-05-27).
*/

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 500;
const SUBSCRIPTION_KEY_PREFIX = "marzneshin:user:";

export class MarzneshinProxyError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "MarzneshinProxyError";
    this.code = code;
  }
}

export type IssueKeyInput = {
  paymentId: string;
  periodDays: number;
  userId: string;
  email: string;
};

export type IssueKeyResult = {
  marzUsername: string;
  subscriptionUrl: string;
  idempotentReplay: boolean;
};

export type SubscriptionRecord = {
  marzUsername: string;
  subscriptionUrl: string;
  issuedAt: string;
  periodDays: number;
  paymentId: string;
  source: "auto-issue" | "manual-grant";
};

type ProxyResponse = {
  marz_username?: unknown;
  subscription_url?: unknown;
  error?: unknown;
};

function getProxyEnv() {
  const url = process.env.MARZNESHIN_PROXY_URL?.trim();
  const secret = process.env.MARZNESHIN_PROXY_HMAC_SECRET?.trim();
  if (!url || !secret) {
    throw new MarzneshinProxyError("proxy_not_configured");
  }
  const timeoutMs = Number(
    process.env.MARZNESHIN_PROXY_TIMEOUT_MS || DEFAULT_TIMEOUT_MS
  );
  return {
    url: url.replace(/\/+$/, ""),
    secret,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0
      ? timeoutMs
      : DEFAULT_TIMEOUT_MS,
  };
}

export function isMarzneshinProxyConfigured(): boolean {
  return Boolean(
    process.env.MARZNESHIN_PROXY_URL?.trim() &&
      process.env.MARZNESHIN_PROXY_HMAC_SECRET?.trim()
  );
}

function signBody(body: string, secret: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

function readString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  return null;
}

// The subscription URL is surfaced to the user and pasted into their client,
// so it must be a public https link. A misconfigured partner returning an
// internal/http URL would otherwise show a dead key — reject it and fall back
// to the manual issue path. Scheme check only; the value carries the access
// token, so it is never logged.
function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

// One retry on network / 5xx with fixed jitter. Idempotent from partner's
// perspective (they key off payment_id), so retrying a "maybe-completed"
// call is safe — partner returns 409 with the original record if the first
// attempt actually landed.
async function postWithRetry(
  url: string,
  body: string,
  signature: string,
  timeoutMs: number
): Promise<Response> {
  const controller1 = new AbortController();
  const t1 = setTimeout(() => controller1.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PRSLOY-Signature": signature,
      },
      body,
      cache: "no-store",
      signal: controller1.signal,
    });
    if (res.status < 500) return res;
  } catch (err) {
    // Fall through to retry. We swallow the error and retry once.
    console.warn("[marzneshin] network error, retrying once", err);
  } finally {
    clearTimeout(t1);
  }

  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));

  const controller2 = new AbortController();
  const t2 = setTimeout(() => controller2.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PRSLOY-Signature": signature,
      },
      body,
      cache: "no-store",
      signal: controller2.signal,
    });
  } finally {
    clearTimeout(t2);
  }
}

export async function issueKey(input: IssueKeyInput): Promise<IssueKeyResult> {
  const env = getProxyEnv();
  const body = JSON.stringify({
    payment_id: input.paymentId,
    period_days: input.periodDays,
    prsloy_user_id: input.userId,
    email: input.email,
  });
  const signature = signBody(body, env.secret);

  const res = await postWithRetry(
    `${env.url}/external/issue-key`,
    body,
    signature,
    env.timeoutMs
  );

  const data = (await res.json().catch(() => null)) as ProxyResponse | null;

  if (res.status === 401) {
    console.warn("[marzneshin] 401 from proxy — HMAC secret out of sync?");
    throw new MarzneshinProxyError("proxy_bad_signature");
  }
  if (res.status === 400) {
    console.warn("[marzneshin] 400 from proxy", data);
    throw new MarzneshinProxyError("proxy_bad_request");
  }
  if (res.status >= 500 || !data) {
    console.warn("[marzneshin] upstream failure", res.status, data);
    throw new MarzneshinProxyError("proxy_upstream_failure");
  }

  const marzUsername = readString(data.marz_username);
  const subscriptionUrl = readString(data.subscription_url);
  if (!marzUsername || !subscriptionUrl) {
    console.warn("[marzneshin] malformed response", data);
    throw new MarzneshinProxyError("proxy_malformed_response");
  }
  if (!isHttpsUrl(subscriptionUrl)) {
    // Don't log the value — the subscription URL carries the access token.
    console.warn("[marzneshin] subscription_url is not a public https URL — rejecting");
    throw new MarzneshinProxyError("proxy_malformed_response");
  }

  return {
    marzUsername,
    subscriptionUrl,
    idempotentReplay: res.status === 409,
  };
}

// KV layout: `marzneshin:user:<userId>` → JSON SubscriptionRecord.
// One record per user — when their plan extends/renews we overwrite with
// new periodDays + paymentId; subscriptionUrl stays the same unless the
// admin explicitly revokes (separate flow, not implemented yet).

function subscriptionKey(userId: string): string {
  return `${SUBSCRIPTION_KEY_PREFIX}${userId}`;
}

export async function saveSubscriptionRecord(
  userId: string,
  record: SubscriptionRecord
): Promise<void> {
  await kvSet(subscriptionKey(userId), JSON.stringify(record));
}

export async function getSubscriptionRecord(
  userId: string
): Promise<SubscriptionRecord | null> {
  let raw: string | null;
  try {
    raw = await kvGet(subscriptionKey(userId));
  } catch (err) {
    if (err instanceof KvNotConfiguredError) return null;
    throw err;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SubscriptionRecord;
  } catch (err) {
    console.warn("[marzneshin] corrupt subscription record for", userId, err);
    return null;
  }
}

// Maps a Period → calendar days for the partner's expire calculation.
// Partner uses fixed_date expire_strategy; we pass days, they compute
// expire_date = now + days at request time.
export function periodToDays(period: Period): number {
  switch (period) {
    case "1mo":
      return 30;
    case "6mo":
      return 180;
    case "1yr":
      return 365;
  }
}

export function getMarzneshinProxyErrorCode(err: unknown): string | null {
  if (err instanceof MarzneshinProxyError) return err.code;
  return null;
}
