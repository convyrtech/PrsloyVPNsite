import { kvRateLimit } from "@/lib/kv";

export type RateLimitOutcome = {
  ok: boolean;
  retryAfter: number;
};

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

/* Fixed-window rate limit. Fails open: if the KV call errors, the request is
   allowed — the auth handler that follows will surface a real storage error. */
export async function rateLimit(
  bucket: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitOutcome> {
  try {
    const { count, ttl } = await kvRateLimit(`rl:${bucket}:${identifier}`, windowSeconds);
    if (count > limit) {
      return { ok: false, retryAfter: ttl > 0 ? ttl : windowSeconds };
    }
    return { ok: true, retryAfter: 0 };
  } catch (err) {
    console.warn("[rate-limit] check failed; allowing request", err);
    return { ok: true, retryAfter: 0 };
  }
}
