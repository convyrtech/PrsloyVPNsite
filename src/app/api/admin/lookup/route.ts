import { NextResponse } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { findUserByIdentifier, getAuthSetupErrorCode } from "@/lib/auth";
import { getSubscriptionRecord } from "@/lib/marzneshin-proxy";

export const runtime = "nodejs";

const MAX_IDENTIFIER_LENGTH = 256;

// Read-only lookup for the access card: resolve a user by email / @username /
// numeric Telegram id, then attach the SubscriptionRecord (this is the first
// reader of that record — see docs/admin-design.md §6). The operator-safe
// shape still carries the subscriptionUrl, mirroring /grant and /issue, since
// the surface is already behind ADMIN_SECRET.
export async function GET(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const identifier = (
    new URL(req.url).searchParams.get("identifier") ?? ""
  ).trim();
  if (!identifier) {
    return NextResponse.json(
      { ok: false, error: "identifier_required" },
      { status: 400 }
    );
  }
  if (identifier.length > MAX_IDENTIFIER_LENGTH) {
    return NextResponse.json(
      { ok: false, error: "invalid_identifier" },
      { status: 400 }
    );
  }

  try {
    const user = await findUserByIdentifier(identifier);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "user_not_found" },
        { status: 404 }
      );
    }
    // Approximate expiry is derived client-side from issuedAt + periodDays.
    // marzUsername / paymentId stay server-side — the card doesn't need them.
    const record = await getSubscriptionRecord(user.id);
    const subscription = record
      ? {
          issuedAt: record.issuedAt,
          periodDays: record.periodDays,
          source: record.source,
        }
      : null;
    return NextResponse.json({ ok: true, user, subscription });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[admin] lookup failed", err);
    return NextResponse.json({ ok: false, error: "lookup_failed" }, { status: 500 });
  }
}
