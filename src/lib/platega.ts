import { createHash, timingSafeEqual } from "crypto";
import type { PaymentOrder } from "@/lib/payments";

export type PlategaPayment = {
  transactionId: string;
  paymentUrl: string;
  status: string | null;
};

export class PlategaError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "PlategaError";
    this.code = code;
  }
}

type PlategaCreateResponse = {
  transactionId?: unknown;
  id?: unknown;
  redirect?: unknown;
  url?: unknown;
  paymentUrl?: unknown;
  status?: unknown;
  error?: unknown;
  message?: unknown;
};

const DEFAULT_BASE_URL = "https://app.platega.io";
const DEFAULT_PROCESS_PATH = "/transaction/process";
const DEFAULT_SBP_METHOD_ID = 2;

function getPlategaEnv() {
  const merchantId = process.env.PLATEGA_MERCHANT_ID?.trim();
  const secret = process.env.PLATEGA_SECRET?.trim();
  if (!merchantId || !secret) throw new PlategaError("platega_not_configured");

  const baseUrl = (
    process.env.PLATEGA_BASE_URL?.trim() || DEFAULT_BASE_URL
  ).replace(/\/+$/, "");
  const processPath =
    process.env.PLATEGA_PROCESS_PATH?.trim() || DEFAULT_PROCESS_PATH;
  const sbpMethodId = Number(
    process.env.PLATEGA_SBP_PAYMENT_METHOD_ID || DEFAULT_SBP_METHOD_ID
  );

  return { merchantId, secret, baseUrl, processPath, sbpMethodId };
}

export function isPlategaConfigured(): boolean {
  return Boolean(
    process.env.PLATEGA_MERCHANT_ID?.trim() && process.env.PLATEGA_SECRET?.trim()
  );
}

export function isPlategaCallbackAuthorized(req: Request): boolean {
  const merchantId = process.env.PLATEGA_MERCHANT_ID?.trim();
  const secret = process.env.PLATEGA_SECRET?.trim();
  if (!merchantId || !secret) return false;

  return (
    safeEqual(req.headers.get("x-merchantid") || "", merchantId) &&
    safeEqual(req.headers.get("x-secret") || "", secret)
  );
}

export async function createPlategaPayment(input: {
  order: PaymentOrder;
  siteUrl: string;
  locale: string;
}): Promise<PlategaPayment> {
  const env = getPlategaEnv();
  const locale = input.locale === "en" ? "en" : "ru";
  const returnUrl = `${input.siteUrl}/${locale}/dashboard?payment=success`;
  const failedUrl = `${input.siteUrl}/${locale}/pricing?payment=failed`;

  const res = await fetch(`${env.baseUrl}${env.processPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MerchantId": env.merchantId,
      "X-Secret": env.secret,
    },
    body: JSON.stringify({
      paymentMethod: env.sbpMethodId,
      paymentDetails: {
        amount: input.order.amountRub,
        currency: "RUB",
      },
      description: `PRSLOY ${input.order.period} access`,
      return: returnUrl,
      failedUrl,
      payload: input.order.id,
    }),
    cache: "no-store",
  });

  const data = (await res.json().catch(() => null)) as PlategaCreateResponse | null;
  if (!res.ok || !data) {
    console.warn("[platega] create payment failed", res.status, data);
    throw new PlategaError("platega_create_failed");
  }

  const transactionId = readString(data.transactionId) || readString(data.id);
  const paymentUrl =
    readString(data.redirect) || readString(data.url) || readString(data.paymentUrl);
  if (!transactionId || !paymentUrl) {
    console.warn("[platega] create payment malformed response", data);
    throw new PlategaError("platega_malformed_response");
  }

  return {
    transactionId,
    paymentUrl,
    status: readString(data.status),
  };
}

export function getPlategaSetupErrorCode(err: unknown) {
  if (err instanceof PlategaError) return err.code;
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}
