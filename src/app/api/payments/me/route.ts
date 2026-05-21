import { NextResponse } from "next/server";
import { getAuthSetupErrorCode, getCurrentUser } from "@/lib/auth";
import { getLatestPaymentOrder, getPaymentSetupErrorCode } from "@/lib/payments";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json(
        { ok: false, error: "authentication_required" },
        { status: 401 }
      );
    }

    const order = await getLatestPaymentOrder(user.id);
    return NextResponse.json({ ok: true, order });
  } catch (err) {
    const setupError = getAuthSetupErrorCode(err) || getPaymentSetupErrorCode(err);
    if (setupError) {
      return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
    }
    console.warn("[payments] latest payment failed", err);
    return NextResponse.json({ ok: false, error: "payment_list_failed" }, { status: 500 });
  }
}
