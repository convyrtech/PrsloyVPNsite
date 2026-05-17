import { createHash, timingSafeEqual } from "crypto";

// True only when ADMIN_SECRET is set. Without it the admin endpoints
// stay disabled and indistinguishable from routes that do not exist.
export function isAdminConfigured(): boolean {
  return Boolean(process.env.ADMIN_SECRET?.trim());
}

// Constant-time compare via fixed-length digests — avoids leaking the
// secret length and short-circuiting on the first wrong byte.
export function isAdminAuthorized(req: Request): boolean {
  const secret = process.env.ADMIN_SECRET?.trim();
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(secret).digest();
  return timingSafeEqual(a, b);
}
