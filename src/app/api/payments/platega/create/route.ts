import { NextResponse } from "next/server";
import { getAuthSetupErrorCode, getCurrentUser } from "@/lib/auth";
import {
  attachPaymentTransaction,
  createPaymentOrder,
  getPaymentSetupErrorCode,
} from "@/lib/payments";
import {
  createPlategaPayment,
  getPlategaSetupErrorCode,
} from "@/lib/platega";
import { type Period, PERIODS } from "@/lib/pricing";
import type { PaymentMethod } from "@/lib/payments";

export const runtime = "nodejs";

type CreateBody = {
  period?: unknown;
  locale?: unknown;
  method?: unknown;
};

const ALLOWED_METHODS: ReadonlySet<PaymentMethod> = new Set(["sbp_qr", "crypto"]);

export async function POST(req: Request) {
  let body: CreateBody;
  try {
    body = (await req.json()) as CreateBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const period = typeof body.period === "string" ? body.period : "";
  if (!PERIODS.includes(period as Period)) {
    return NextResponse.json({ ok: false, error: "invalid_period" }, { status: 400 });
  }

  const requestedMethod =
    typeof body.method === "string" ? (body.method as PaymentMethod) : "sbp_qr";
  if (!ALLOWED_METHODS.has(requestedMethod)) {
    return NextResponse.json({ ok: false, error: "invalid_method" }, { status: 400 });
  }

  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "authentication_required" },
        { status: 401 }
      );
    }
    // Payments still require an email for the Platega receipt and operator
    // reach-out. Telegram-only users link an email in a follow-up step
    // before they can buy.
    if (!user.email) {
      return NextResponse.json(
        { ok: false, error: "email_required_for_payment" },
        { status: 409 }
      );
    }

    const order = await createPaymentOrder({
      userId: user.id,
      email: user.email,
      period: period as Period,
      method: requestedMethod,
    });
    const siteUrl = getSiteUrl(req);
    const platega = await createPlategaPayment({
      order,
      siteUrl,
      locale: typeof body.locale === "string" ? body.locale : "ru",
      method: requestedMethod,
    });
    const attached = await attachPaymentTransaction({
      orderId: order.id,
      transactionId: platega.transactionId,
      paymentUrl: platega.paymentUrl,
      providerStatus: platega.status,
    });

    return NextResponse.json({
      ok: true,
      paymentUrl: platega.paymentUrl,
      order: attached,
    });
  } catch (err) {
    const setupError =
      getAuthSetupErrorCode(err) ||
      getPaymentSetupErrorCode(err) ||
      getPlategaSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[payments] create platega payment failed", err);
    return NextResponse.json({ ok: false, error: "payment_create_failed" }, { status: 500 });
  }
}

function getSiteUrl(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return new URL(req.url).origin;
}
