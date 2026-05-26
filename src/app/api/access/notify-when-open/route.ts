import { NextResponse } from "next/server";
import { kvListPushCapped } from "@/lib/kv";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

// Pool-full state form: visitor leaves a contact (@telegram or email)
// to be notified when slots open up. Stored as a capped list — the
// operator pops it from KV when expanding the pool. Not persistent
// per-user (no dedup) — that's fine for a notify-list at this scale.
//
// KV: access:notify-list  LIST of JSON {contact, ip, ts}, capped at 1000
const NOTIFY_LIST_KEY = "access:notify-list";
const NOTIFY_LIST_CAP = 1000;

const IP_LIMIT = 5;
const IP_WINDOW = 3600;

type Body = { contact?: unknown };

function isValid(contact: string): boolean {
  const v = contact.trim();
  if (!v || v.length > 254) return false;
  // @username (Telegram)
  if (/^@[A-Za-z0-9_]{5,32}$/.test(v)) return true;
  // email
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  return false;
}

export async function POST(req: Request) {
  const ip = await rateLimit("notify-open", getClientIp(req), IP_LIMIT, IP_WINDOW);
  if (!ip.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(ip.retryAfter) } }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const contact = typeof body.contact === "string" ? body.contact.trim() : "";
  if (!isValid(contact)) {
    return NextResponse.json(
      { ok: false, error: "invalid_contact" },
      { status: 400 }
    );
  }

  try {
    await kvListPushCapped(
      NOTIFY_LIST_KEY,
      JSON.stringify({
        contact,
        ip: getClientIp(req),
        ts: new Date().toISOString(),
      }),
      NOTIFY_LIST_CAP
    );
  } catch (err) {
    console.warn("[notify-open] kv push failed", err);
    return NextResponse.json(
      { ok: false, error: "storage_failed" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
