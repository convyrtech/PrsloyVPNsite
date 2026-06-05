"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { Bracketed } from "@/components/ui/Bracketed";
import { type Period, getPeriodTotalRub, getPeriodTotalUsd } from "@/lib/pricing";
import type { PaymentMethod } from "@/lib/payments";
import { readUtmSource } from "@/lib/client-utm";
import { DottedSnakeBorder } from "@/components/ui/DottedSnakeBorder";

type CheckoutState =
  | { kind: "idle" }
  | { kind: "loading"; method: PaymentMethod }
  | { kind: "error" };

type Copy = {
  paySbp: string;
  payCrypto: string;
  loadingSbp: string;
  loadingCrypto: string;
  login: string;
  register: string;
  authError: string;
  configError: string;
  emailRequired: string;
  genericError: string;
};

const COPY: Record<"ru" | "en", Copy> = {
  ru: {
    paySbp: "Оплатить СБП",
    payCrypto: "Оплатить USDT",
    loadingSbp: "Создаём СБП-платёж...",
    loadingCrypto: "Создаём крипто-платёж...",
    login: "Войти",
    register: "Создать аккаунт",
    authError: "Сначала войди или создай PRSLOY ID, чтобы оплата привязалась к кабинету.",
    configError: "Оплата временно недоступна. Напиши в поддержку.",
    emailRequired: "Для оплаты нужен email. Привязка email появится отдельным шагом.",
    genericError: "Не получилось создать платеж. Попробуй еще раз или напиши в поддержку.",
  },
  en: {
    paySbp: "Pay with SBP",
    payCrypto: "Pay with USDT",
    loadingSbp: "Creating SBP payment...",
    loadingCrypto: "Creating crypto payment...",
    login: "Sign in",
    register: "Create account",
    authError: "Sign in or create a PRSLOY ID first so the payment is tied to your dashboard.",
    configError: "Payment is temporarily unavailable. Message support.",
    emailRequired: "Payment requires an email. Email linking ships in a follow-up step.",
    genericError: "Could not create a payment. Try again or contact support.",
  },
};

// Group thousands with a space: 3240 -> "3 240".
function fmtRub(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function PaymentCheckout({
  period,
  locale,
}: {
  period: Period;
  locale: string;
}) {
  const copy = locale === "en" ? COPY.en : COPY.ru;
  const totalRub = getPeriodTotalRub(period);
  const totalUsd = getPeriodTotalUsd(period);
  const [state, setState] = useState<CheckoutState>({ kind: "idle" });
  const [error, setError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);

  async function startPayment(method: PaymentMethod) {
    if (state.kind === "loading") return;
    setState({ kind: "loading", method });
    setError("");
    setNeedsAuth(false);

    try {
      const utmSource = readUtmSource();
      const res = await fetch("/api/payments/platega/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          period,
          locale,
          method,
          ...(utmSource ? { utmSource } : {}),
        }),
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
      } else if (data.error === "email_required_for_payment") {
        setError(copy.emailRequired);
      } else {
        setError(copy.genericError);
      }
      setState({ kind: "error" });
    } catch {
      setError(copy.genericError);
      setState({ kind: "error" });
    }
  }

  const loadingMethod = state.kind === "loading" ? state.method : null;
  const isLoading = state.kind === "loading";

  return (
    <div className="flex flex-col gap-sm">
      {/* Relative flex wrapper keeps the button full-width while hosting the
          snake overlay. While the SBP payment is being created, dark dots ride
          the pill edge — a "working" wave over the white button. */}
      <div className="relative flex flex-col">
        <button
          type="button"
          onClick={() => startPayment("sbp_qr")}
          disabled={isLoading}
          className="group inline-flex min-h-[48px] items-center justify-center bg-text-display px-lg
                     font-mono text-label uppercase tracking-[0.08em] text-black rounded-full
                     enabled:hover:opacity-90 enabled:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]
                     transition disabled:opacity-60 disabled:cursor-wait"
        >
          <Bracketed>{loadingMethod === "sbp_qr" ? copy.loadingSbp : `${copy.paySbp} · ${fmtRub(totalRub)} ₽`}</Bracketed>
        </button>
        {loadingMethod === "sbp_qr" && (
          <DottedSnakeBorder
            radius={24}
            dotGap={10}
            dotBase={1}
            dotPeak={2.6}
            color="rgba(0,0,0,0.8)"
            dim="rgba(0,0,0,0.12)"
          />
        )}
      </div>
      <button
        type="button"
        onClick={() => startPayment("crypto")}
        disabled={isLoading}
        className="group inline-flex min-h-[48px] items-center justify-center border border-border-visible px-lg
                   font-mono text-label uppercase tracking-[0.08em] text-text-display rounded-full
                   enabled:hover:border-text-display enabled:hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]
                   transition disabled:opacity-60 disabled:cursor-wait"
      >
        <Bracketed>{loadingMethod === "crypto" ? copy.loadingCrypto : `${copy.payCrypto} · $${totalUsd}`}</Bracketed>
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
                className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
                           font-mono text-label uppercase tracking-[0.08em] text-text-display
                           hover:border-text-display transition-colors"
              >
                [ {copy.login} ]
              </Link>
              <Link
                href="/register"
                className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
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
