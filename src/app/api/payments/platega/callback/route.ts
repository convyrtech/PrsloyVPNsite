import { NextResponse } from "next/server";
import {
  getPaymentSetupErrorCode,
  PaymentError,
  updatePaymentByTransaction,
} from "@/lib/payments";
import {
  isPlategaCallbackAuthorized,
  isPlategaConfigured,
} from "@/lib/platega";

export const runtime = "nodejs";

type CallbackBody = {
  id?: unknown;
  transactionId?: unknown;
  status?: unknown;
};

export async function POST(req: Request) {
  if (!isPlategaConfigured()) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (!isPlategaCallbackAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: CallbackBody;
  try {
    body = (await req.json()) as CallbackBody;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const transactionId = readString(body.id) || readString(body.transactionId);
  const status = readString(body.status);
  if (!transactionId || !status) {
    return NextResponse.json(
      { ok: false, error: "invalid_callback" },
      { status: 400 }
    );
  }

  try {
    const order = await updatePaymentByTransaction({
      transactionId,
      providerStatus: status,
    });
    return NextResponse.json({ ok: true, orderId: order.id, status: order.status });
  } catch (err) {
    const setupError = getPaymentSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    if (
      err instanceof PaymentError &&
      (err.code === "transaction_not_found" || err.code === "order_not_found")
    ) {
      return NextResponse.json({ ok: false, error: err.code }, { status: 404 });
    }
    console.warn("[payments] platega callback failed", err);
    return NextResponse.json({ ok: false, error: "callback_failed" }, { status: 500 });
  }
}

function readString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}
