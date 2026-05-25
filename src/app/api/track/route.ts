import { NextResponse } from "next/server";
import { after } from "next/server";
import { isBotUA, sanitizeKeyPart, track } from "@/lib/analytics";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

/* Beacon receiver. The contract is intentionally narrow:

   - The endpoint ONLY accepts client-side pageview events. Conversion
     events (register_success, payment_confirmed, etc.) are emitted
     server-side from the routes that own that state, never trusted
     from the browser — otherwise anyone could inflate the funnel
     with a curl.
   - It ALWAYS returns 204 No Content, even on rejection. Beacons that
     get a 5xx will trigger fetch retries, multiplying the same noise
     across the network. A silent drop is correct.
   - The actual KV writes run inside next/server's after() so the
     response is back to the browser before the Upstash round-trip
     starts. */

const TRACK_LIMIT = 30;
const TRACK_WINDOW_SECONDS = 60;
const MAX_BODY_BYTES = 2_000;

type RawBody = {
  name?: unknown;
  path?: unknown;
  utmSource?: unknown;
};

function noContent() {
  return new NextResponse(null, { status: 204 });
}

function readString(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

export async function POST(req: Request) {
  // Cross-origin requests are not from our own pages — reject silently.
  // Browsers always set Sec-Fetch-Site for fetch initiated from a page;
  // a missing header is suspicious (Node http clients, scripts) too.
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return noContent();

  if (isBotUA(req.headers.get("user-agent"))) return noContent();

  const ip = getClientIp(req);
  const limit = await rateLimit("track", ip, TRACK_LIMIT, TRACK_WINDOW_SECONDS);
  if (!limit.ok) return noContent();

  // Cheap size guard before parsing — defends against giant bodies that
  // would tie up JSON parsing.
  const contentLength = Number(req.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) return noContent();

  let body: RawBody;
  try {
    body = (await req.json()) as RawBody;
  } catch {
    return noContent();
  }

  if (!body || typeof body !== "object") return noContent();
  if (body.name !== "pageview") return noContent();

  const path = readString(body.path, 200);
  if (!path) return noContent();

  const utmSourceRaw = readString(body.utmSource, 80);
  const utmSource = utmSourceRaw ? sanitizeKeyPart(utmSourceRaw) : undefined;

  after(() =>
    track({
      name: "pageview",
      path: sanitizeKeyPart(path) || "_",
      ...(utmSource ? { utmSource } : {}),
    })
  );

  return noContent();
}
