import { kvRateLimit } from "@/lib/kv";

export type RateLimitOutcome = {
  ok: boolean;
  retryAfter: number;
};

// A fail-closed deny is caused by a (transient) KV outage, not by the client
// actually exceeding its budget — so advise a SHORT retry instead of echoing
// the full window. The deny itself is what bounds brute force; retryAfter is
// only advisory, so a short value can't weaken the throttle but does stop a
// brief blip from locking a user out for the whole window (register's is 1h).
const FAIL_CLOSED_RETRY_SECONDS = 5;

/* Best-effort client IP. Vercel populates x-forwarded-for; the first entry
   is the real client. Falls back to a shared "unknown" bucket. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/* Fixed-window rate limit.

   Default = FAIL OPEN: if the KV call errors, the request is allowed and the
   handler that follows surfaces the real storage error. This keeps the site
   usable during a KV blip for non-security counters.

   Pass `{ failClosed: true }` for auth-critical buckets (nonce/secret/password
   guessing, signup spam) where a KV outage must NOT lift the throttle — there
   the safe default is to deny (429) rather than allow unbounded attempts. */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number,
  opts: { failClosed?: boolean } = {}
): Promise<RateLimitOutcome> {
  try {
    const { count, ttl } = await kvRateLimit(`rl:${bucket}:${identifier}`, windowSeconds);
    if (count > limit) {
      return { ok: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }
    return { ok: true, retryAfter: 0 };
  } catch (err) {
    if (opts.failClosed) {
      console.warn("[rate-limit] check failed; denying (fail-closed)", bucket, err);
      return { ok: false, retryAfter: FAIL_CLOSED_RETRY_SECONDS };
    }
    console.warn("[rate-limit] check failed; allowing request", err);
    return { ok: true, retryAfter: 0 };
  }
}
