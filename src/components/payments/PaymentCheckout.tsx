"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import type { Period } from "@/lib/pricing";

type CheckoutState = "idle" | "loading" | "error";

type Copy = {
  title: string;
  body: string;
  pay: string;
  loading: string;
  login: string;
  register: string;
  authError: string;
  configError: string;
  genericError: string;
};

const COPY: Record<"ru" | "en", Copy> = {
  ru: {
    title: "Оплата СБП",
    body:
      "Сейчас подключен СБП QR. После оплаты подписка активируется в ЛК, ключ выдаем вручную до подключения API.",
    pay: "Оплатить СБП",
    loading: "Создаем платеж...",
    login: "Войти",
    register: "Создать аккаунт",
    authError: "Сначала войди или создай PRSLOY ID, чтобы оплата привязалась к кабинету.",
    configError: "Оплата временно недоступна. Напиши в поддержку.",
    genericError: "Не получилось создать платеж. Попробуй еще раз или напиши в поддержку.",
  },
  en: {
    title: "Pay with SBP",
    body:
      "SBP QR is the first method connected. After payment, your subscription activates in the dashboard; the key is issued manually until the API is connected.",
    pay: "Pay with SBP",
    loading: "Creating payment...",
    login: "Sign in",
    register: "Create account",
    authError: "Sign in or create a PRSLOY ID first so the payment is tied to your dashboard.",
    configError: "Payment is temporarily unavailable. Message support.",
    genericError: "Could not create a payment. Try again or contact support.",
  },
};

export function PaymentCheckout({
  period,
  locale,
}: {
  period: Period;
  locale: string;
}) {
  const copy = locale === "en" ? COPY.en : COPY.ru;
  const [state, setState] = useState<CheckoutState>("idle");
  const [error, setError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);

  async function startPayment() {
    if (state === "loading") return;
    setState("loading");
    setError("");
    setNeedsAuth(false);

    try {
      const res = await fetch("/api/payments/platega/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        paymentUrl?: string;
        error?: string;
      };

      if (res.ok && data.ok && data.paymentUrl) {
        window.location.href = data.paymentUrl;
        return;
      }

      if (data.error === "authentication_required") {
        setNeedsAuth(true);
        setError(copy.authError);
      } else if (data.error === "platega_not_configured") {
        setError(copy.configError);
      } else {
        setError(copy.genericError);
      }
      setState("error");
    } catch {
      setError(copy.genericError);
      setState("error");
    }
  }

  return (
    <div className="border border-border-visible rounded-[8px] bg-black p-lg flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {copy.title}
        </span>
        <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
          {copy.body}
        </p>
      </div>

      <button
        type="button"
        onClick={startPayment}
        disabled={state === "loading"}
        className="inline-flex min-h-[48px] items-center justify-center bg-text-display px-lg
                   font-mono text-label uppercase tracking-[0.08em] text-black rounded-full
                   hover:opacity-90 active:scale-[0.98] transition disabled:opacity-60
                   disabled:cursor-wait"
      >
        [ {state === "loading" ? copy.loading : copy.pay} ]
      </button>

      {error && (
        <div className="flex flex-col gap-sm">
          <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
            {error}
          </p>
          {needsAuth && (
            <div className="flex flex-col sm:flex-row gap-sm">
              <Link
                href="/login"
                className="inline-flex min-h-[40px] items-center justify-center border border-border-visible px-md
                           font-mono text-label uppercase tracking-[0.08em] text-text-display
                           hover:border-text-display transition-colors"
              >
                [ {copy.login} ]
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-[40px] items-center justify-center border border-border-visible px-md
                           font-mono text-label uppercase tracking-[0.08em] text-text-display
                           hover:border-text-display transition-colors"
              >
                [ {copy.register} ]
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
