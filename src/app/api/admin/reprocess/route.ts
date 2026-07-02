import { NextResponse, after } from "next/server";
import { isAdminAuthorized, isAdminConfigured } from "@/lib/admin-auth";
import { findUserByIdentifier, getAuthSetupErrorCode } from "@/lib/auth";
import {
  getLatestPaymentOrder,
  getPaymentSetupErrorCode,
  issueKeyForOrder,
  PaymentError,
  updatePaymentByTransaction,
} from "@/lib/payments";
import { isMarzneshinProxyConfigured } from "@/lib/marzneshin-proxy";
import { writeAuditEntry } from "@/lib/admin-audit";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/analytics";

export const runtime = "nodejs";

/* Re-run the payment-confirmation pipeline for a user's latest order, exactly
   as the Platega callback does (updatePaymentByTransaction -> confirm ->
   auto-issue). Operator tool: prove the auto-issue path end-to-end without a
   fresh payment, and recover an order stuck at PENDING because its callback
   never landed. Idempotent — an already-confirmed order is a no-op
   (confirmedNow=false), so it never double-issues or double-counts.

   Second job: recover a CONFIRMED order whose auto-issue failed (or whose
   function died mid-issue). Those orders are unreachable through the NX-gated
   confirm branch, so this route re-drives issuance directly with the ORIGINAL
   order id — partner-side idempotency (payment_id = order.id) makes a replay
   return the already-issued record instead of a second subscription. */

const REPROCESS_LIMIT = 20;
const REPROCESS_WINDOW_SECONDS = 60;

type Body = { email?: unknown };

export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isAdminAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const limited = await rateLimit(
    "admin-reprocess",
    "op",
    REPROCESS_LIMIT,
    REPROCESS_WINDOW_SECONDS
  );
  if (!limited.ok) {
    return NextResponse.json(
      { ok: false, error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!email) {
    return NextResponse.json({ ok: false, error: "email_required" }, { status: 400 });
  }

  try {
    const user = await findUserByIdentifier(email);
    if (!user) {
      return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
    }
    const order = await getLatestPaymentOrder(user.id);
    if (!order) {
      return NextResponse.json({ ok: false, error: "order_not_found" }, { status: 404 });
    }
    if (!order.transactionId) {
      return NextResponse.json({ ok: false, error: "no_transaction" }, { status: 409 });
    }

    const result = await updatePaymentByTransaction({
      transactionId: order.transactionId,
      providerStatus: "CONFIRMED",
    });

    // Confirmed-but-keyless recovery (see header comment). Triggers when the
    // user record has no key or the order carries a failed-issue marker.
    let reissued = false;
    let reissueError: string | null = null;
    if (
      !result.confirmedNow &&
      result.order.status === "confirmed" &&
      isMarzneshinProxyConfigured() &&
      (!user.subscriptionUrl || result.order.issueError)
    ) {
      try {
        await issueKeyForOrder(result.order);
        reissued = true;
      } catch (err) {
        reissueError =
          err instanceof Error && "code" in err &&
          typeof (err as { code?: unknown }).code === "string"
            ? (err as { code: string }).code
            : err instanceof Error
              ? err.message
              : "unknown";
        console.warn("[admin] reprocess re-issue failed", result.order.id, err);
      }
    }

    await writeAuditEntry({
      action: "reprocess",
      targetUserId: user.id,
      targetEmail: user.email,
      note:
        `order ${result.order.id} -> ${result.order.status} ` +
        `(confirmedNow=${result.confirmedNow}` +
        `${reissued ? ", reissued" : ""}` +
        `${reissueError ? `, reissue_error=${reissueError}` : ""})`,
      result: reissueError ? "error" : "ok",
    });

    // Mirror the callback: emit payment_confirmed exactly once, only on the
    // real first confirmation.
    if (result.confirmedNow) {
      after(() =>
        track({
          name: "payment_confirmed",
          orderId: result.order.id,
          amountRub: result.order.amountRub,
          ...(result.order.utmSource ? { utmSource: result.order.utmSource } : {}),
        })
      );
    }

    return NextResponse.json({
      ok: true,
      orderId: result.order.id,
      status: result.order.status,
      confirmedNow: result.confirmedNow,
      reissued,
      ...(reissueError ? { reissueError } : {}),
    });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err) || getPaymentSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (err instanceof PaymentError) {
      return NextResponse.json({ ok: false, error: err.code }, { status: 404 });
    }
    console.warn("[admin] reprocess failed", err);
    return NextResponse.json({ ok: false, error: "reprocess_failed" }, { status: 500 });
  }
}
