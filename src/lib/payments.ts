import { randomBytes } from "crypto";
import { kvGet, kvSet, KvNotConfiguredError } from "@/lib/kv";
import { grantSubscriptionByUserId } from "@/lib/auth";
import { incrementPayingCounter } from "@/lib/capacity";
import { writeAuditEntry } from "@/lib/admin-audit";
import { sendTransactionalEmail } from "@/lib/email";
import { track } from "@/lib/analytics";
import {
  isMarzneshinProxyConfigured,
  issueKey,
  periodToDays,
  saveSubscriptionRecord,
} from "@/lib/marzneshin-proxy";
import {
  type Period,
  getPeriodTotalRub,
  getPeriodTotalUsd,
} from "@/lib/pricing";

export type PaymentProvider = "platega";
export type PaymentMethod = "sbp_qr" | "crypto";
export type PaymentStatus =
  | "created"
  | "pending"
  | "confirmed"
  | "canceled"
  | "chargebacked"
  | "failed";

export type PaymentOrder = {
  id: string;
  provider: PaymentProvider;
  method: PaymentMethod;
  userId: string;
  email: string;
  period: Period;
  amountRub: number;
  amountUsd: number;
  currency: "RUB";
  status: PaymentStatus;
  providerStatus: string | null;
  transactionId: string | null;
  paymentUrl: string | null;
  createdAt: string;
  updatedAt: string;
  confirmedAt: string | null;
  // Sanitized utm_source captured at order creation. Threaded into the
  // payment_confirmed analytics event in the callback so the funnel
  // can attribute revenue to a traffic source without persisting any
  // per-user UTM record. Optional because orders serialized before this
  // field was introduced rehydrate as undefined — readers must use
  // `order.utmSource ?? null` (or falsy check) and never `=== null`.
  utmSource?: string | null;
  // Error code of a failed auto-issue after a confirmed payment. Makes the
  // paid-but-keyless order durable and discoverable: /api/admin/reprocess
  // re-drives issuance for it, the ЛК shows the honest "issuing manually"
  // state. Cleared on successful issuance. Optional for the same
  // rehydration reason as utmSource.
  issueError?: string | null;
};

export class PaymentError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "PaymentError";
    this.code = code;
  }
}

const ORDER_KEY_PREFIX = "payment:order:";
const TRANSACTION_KEY_PREFIX = "payment:platega:transaction:";
const USER_LATEST_KEY_PREFIX = "payment:user:latest:";

function orderKey(orderId: string) {
  return `${ORDER_KEY_PREFIX}${orderId}`;
}

function transactionKey(transactionId: string) {
  return `${TRANSACTION_KEY_PREFIX}${transactionId}`;
}

function userLatestKey(userId: string) {
  return `${USER_LATEST_KEY_PREFIX}${userId}`;
}

// An order record holds the buyer email, so it must not live in KV forever.
// Bound retention to the paid period + 90 days — matching the privacy page's
// "key record + 90 days" promise instead of indefinite storage. 31-day months
// keep the window generous so an active long-period subscription is never
// expired early. The TTL is refreshed on every write (create / attach /
// confirm), which is fine: the last write for a live order is its confirmation.
const ORDER_RETENTION_PAD_DAYS = 90;
const ORDER_RETENTION_MONTHS: Record<Period, number> = { "1mo": 1, "6mo": 6, "1yr": 12 };

async function saveOrder(order: PaymentOrder): Promise<void> {
  const months = ORDER_RETENTION_MONTHS[order.period] ?? 1;
  const ttlSeconds = (months * 31 + ORDER_RETENTION_PAD_DAYS) * 86400;
  await kvSet(orderKey(order.id), JSON.stringify(order), { ex: ttlSeconds });
}

export async function getPaymentOrder(orderId: string): Promise<PaymentOrder | null> {
  const raw = await kvGet(orderKey(orderId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PaymentOrder;
  } catch (err) {
    console.warn("[payments] corrupt order skipped", orderId, err);
    return null;
  }
}

export async function getLatestPaymentOrder(
  userId: string
): Promise<PaymentOrder | null> {
  const orderId = await kvGet(userLatestKey(userId));
  return orderId ? await getPaymentOrder(orderId) : null;
}

export async function createPaymentOrder(input: {
  userId: string;
  email: string;
  period: Period;
  method: PaymentMethod;
  utmSource?: string | null;
}): Promise<PaymentOrder> {
  const now = new Date().toISOString();
  const order: PaymentOrder = {
    id: randomBytes(12).toString("hex"),
    provider: "platega",
    method: input.method,
    userId: input.userId,
    email: input.email,
    period: input.period,
    amountRub: getPeriodTotalRub(input.period),
    amountUsd: getPeriodTotalUsd(input.period),
    currency: "RUB",
    status: "created",
    providerStatus: null,
    transactionId: null,
    paymentUrl: null,
    createdAt: now,
    updatedAt: now,
    confirmedAt: null,
    utmSource: input.utmSource ?? null,
  };

  await saveOrder(order);
  await kvSet(userLatestKey(input.userId), order.id);
  return order;
}

export async function attachPaymentTransaction(input: {
  orderId: string;
  transactionId: string;
  paymentUrl: string;
  providerStatus?: string | null;
}): Promise<PaymentOrder> {
  const order = await getPaymentOrder(input.orderId);
  if (!order) throw new PaymentError("order_not_found");

  order.transactionId = input.transactionId;
  order.paymentUrl = input.paymentUrl;
  order.status = providerStatusToPaymentStatus(input.providerStatus || "PENDING");
  order.providerStatus = input.providerStatus || "PENDING";
  order.updatedAt = new Date().toISOString();

  await saveOrder(order);
  await kvSet(transactionKey(input.transactionId), order.id);
  return order;
}

export type UpdatePaymentResult = {
  order: PaymentOrder;
  // True only on the transition where status flips into "confirmed" for
  // the first time. Webhooks retry; emitting payment_confirmed analytics
  // on every callback would inflate revenue counts 2-3x.
  confirmedNow: boolean;
};

// Per-order emit gate for the payment_confirmed analytics event. 7-day
// TTL is well past any retry window a provider keeps before declaring a
// transaction dead.
const EMIT_GATE_TTL_SECONDS = 60 * 60 * 24 * 7;
function emitGateKey(orderId: string): string {
  return `payment:emit:${orderId}`;
}

export async function updatePaymentByTransaction(input: {
  transactionId: string;
  providerStatus: string;
}): Promise<UpdatePaymentResult> {
  const orderId = await kvGet(transactionKey(input.transactionId));
  if (!orderId) throw new PaymentError("transaction_not_found");

  const order = await getPaymentOrder(orderId);
  if (!order) throw new PaymentError("order_not_found");

  const nextStatus = providerStatusToPaymentStatus(input.providerStatus);
  // First-time transition guard. Platega retries the callback for the
  // same transactionId on transient errors, so we use the confirmedAt
  // unset → set transition as the idempotency boundary.
  const wasFirstConfirmation =
    nextStatus === "confirmed" && !order.confirmedAt;

  order.providerStatus = input.providerStatus;
  order.status = nextStatus;
  order.updatedAt = new Date().toISOString();
  if (wasFirstConfirmation) {
    order.confirmedAt = order.updatedAt;
  }

  await saveOrder(order);
  await kvSet(userLatestKey(order.userId), order.id);

  // NX-set is the global gate. Two concurrent CONFIRMED callbacks for
  // the same orderId can both read wasFirstConfirmation=true (the read
  // happened before either save landed), so the read-side check is the
  // fast path, not the source of truth. Only one caller wins the SET
  // NX — analytics emit + capacity increment both fire from that single
  // winner, so revenue and the paying-user counter each tick exactly
  // once per real transition no matter how the provider retries.
  let confirmedNow = false;
  if (wasFirstConfirmation) {
    confirmedNow = await kvSet(emitGateKey(order.id), "1", {
      nx: true,
      ex: EMIT_GATE_TTL_SECONDS,
    });
    if (confirmedNow) {
      // Capacity counter is a derived display value, so a failure here
      // must not roll back the order. Worst case the counter falls
      // behind by one — the marketing offset absorbs minor drift, and
      // an operator can recompute by scanning orders if it matters.
      try {
        await incrementPayingCounter();
      } catch (err) {
        console.warn("[payments] capacity counter increment failed", err);
      }

      // Marzneshin auto-issue (Issue #4). Skip silently if the proxy
      // env is not set (staging / local). Failures don't roll back the
      // order — the buyer keeps the paid-awaiting state in the ЛК while
      // reportAutoIssueFailure makes the order durable and loud (issueError
      // marker, admin audit, operator email, funnel event) so it never
      // dies silently again. Recovery: /api/admin/reprocess re-drives
      // issuance with the same payment_id.
      if (isMarzneshinProxyConfigured()) {
        try {
          await issueKeyForOrder(order);
        } catch (err) {
          console.warn(
            "[payments] marzneshin auto-issue failed for order",
            order.id,
            err
          );
          await reportAutoIssueFailure(order, err);
        }
      }
    }
  }
  return { order, confirmedNow };
}

// Issues the Ключ for a confirmed order and surfaces it in the ЛК.
// payment_id = order.id keeps the partner-side idempotency key stable: a
// replay for the same order returns the already-issued record (409 →
// idempotentReplay) instead of minting a second subscription — which is
// exactly why recovery must go through here and NOT /api/admin/issue
// (that path mints a fresh admin-<hex> payment_id and would double-extend).
export async function issueKeyForOrder(order: PaymentOrder): Promise<void> {
  const result = await issueKey({
    paymentId: order.id,
    periodDays: periodToDays(order.period),
    userId: order.userId,
    email: order.email,
  });
  await saveSubscriptionRecord(order.userId, {
    marzUsername: result.marzUsername,
    subscriptionUrl: result.subscriptionUrl,
    issuedAt: new Date().toISOString(),
    periodDays: periodToDays(order.period),
    paymentId: order.id,
    source: "auto-issue",
  });
  // Flip AuthUser to active + populate subscriptionUrl so the
  // dashboard's KeyBlock renders without any further plumbing.
  // Blocked users are kept in moderation limbo per grantAccess
  // semantics — payment still confirms (no rollback) but key is
  // not surfaced until the operator unblocks.
  await grantSubscriptionByUserId(order.userId, result.subscriptionUrl);

  // Auto-issued keys must count in the funnel like admin-issued ones do.
  // track() is fire-and-forget and never throws.
  void track({ name: "key_issued", userId: order.userId });

  if (order.issueError) {
    order.issueError = null;
    order.updatedAt = new Date().toISOString();
    await saveOrder(order);
  }
}

function errorCode(err: unknown): string {
  if (err instanceof Error && "code" in err) {
    const code = (err as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return err instanceof Error ? err.message : "unknown";
}

// A buyer paid but the Ключ did not reach their ЛК. Make the failure
// durable and loud: mark the order (reprocess can re-drive it), write the
// admin audit log the operator already opens, email the operator, count it
// in the funnel. Every step is best-effort — reporting must never throw
// back into the payment callback.
async function reportAutoIssueFailure(
  order: PaymentOrder,
  err: unknown
): Promise<void> {
  const code = errorCode(err);

  try {
    order.issueError = code;
    order.updatedAt = new Date().toISOString();
    await saveOrder(order);
  } catch (saveErr) {
    console.warn(
      "[payments] failed to persist issueError for order",
      order.id,
      saveErr
    );
  }

  // writeAuditEntry is internally best-effort (never throws).
  await writeAuditEntry({
    action: "auto_issue",
    targetUserId: order.userId,
    targetEmail: order.email,
    note: `order ${order.id}: ${code}`,
    result: "error",
  });

  const operatorEmail = process.env.WAITLIST_NOTIFY_EMAIL?.trim();
  if (operatorEmail) {
    try {
      const lines = [
        "Auto-issue failed after a confirmed payment — buyer has no key.",
        `Order: ${order.id}`,
        `Buyer: ${order.email}`,
        `Period: ${order.period}`,
        `Error: ${code}`,
        "",
        `Recover: POST /api/admin/reprocess {"email":"${order.email}"} —`,
        "re-drives issuance with the original payment_id (idempotent, safe).",
        "Do NOT use /api/admin/issue for recovery: it mints a new payment_id",
        "and double-extends if the first issue actually landed.",
      ];
      await sendTransactionalEmail({
        to: operatorEmail,
        subject: `PRSLOY: auto-issue failed for order ${order.id}`,
        text: lines.join("\n"),
        html: `<pre>${lines.join("\n")}</pre>`,
      });
    } catch (mailErr) {
      console.warn(
        "[payments] operator alert email failed for order",
        order.id,
        mailErr
      );
    }
  }

  void track({ name: "issue_failed", orderId: order.id });
}

export function providerStatusToPaymentStatus(status: string): PaymentStatus {
  const normalized = status.trim().toUpperCase();
  if (normalized === "CONFIRMED") return "confirmed";
  if (normalized === "CANCELED") return "canceled";
  if (normalized === "CHARGEBACKED") return "chargebacked";
  if (normalized === "FAILED" || normalized === "EXPIRED") return "failed";
  return "pending";
}

export function getPaymentSetupErrorCode(err: unknown) {
  if (err instanceof KvNotConfiguredError) return "kv_not_configured";
  return null;
}
