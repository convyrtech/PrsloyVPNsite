import { randomBytes } from "crypto";
import { kvGet, kvSet, KvNotConfiguredError } from "@/lib/kv";
import { grantSubscriptionByUserId } from "@/lib/auth";
import { incrementPayingCounter } from "@/lib/capacity";
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
      // order — user sees the pending state on /dashboard and an
      // operator can re-issue via the manual /admin/grant path.
      // Idempotency on partner side is keyed by payment_id (= order.id),
      // so a late retry through this branch is a no-op for partner.
      if (isMarzneshinProxyConfigured()) {
        try {
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
        } catch (err) {
          console.warn(
            "[payments] marzneshin auto-issue failed for order",
            order.id,
            err
          );
        }
      }
    }
  }
  return { order, confirmedNow };
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
