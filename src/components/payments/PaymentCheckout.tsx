"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";
import { Bracketed } from "@/components/ui/Bracketed";
import { type Period, getPeriodTotalRub, getPeriodTotalUsd } from "@/lib/pricing";
import type { PaymentMethod } from "@/lib/payments";
import { readUtmSource } from "@/lib/client-utm";
import { isValidEmail } from "@/lib/validation";
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
  emailStepLabel: string;
  emailStepHint: string;
  emailPlaceholder: string;
  emailSubmit: string;
  emailSubmitting: string;
  emailLinkedNote: string;
  emailInvalid: string;
  emailTaken: string;
  emailRateLimited: string;
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
    emailRequired: "Для оплаты нужна почта — привяжи её в поле выше.",
    genericError: "Не получилось создать платеж. Попробуй еще раз или напиши в поддержку.",
    emailStepLabel: "ПОЧТА ДЛЯ ЧЕКА",
    emailStepHint: "Сюда придёт чек об оплате и служебные письма. Привяжем к твоему PRSLOY ID — и можно платить.",
    emailPlaceholder: "you@email.com",
    emailSubmit: "ПРИВЯЗАТЬ ПОЧТУ",
    emailSubmitting: "ПРИВЯЗЫВАЕМ…",
    emailLinkedNote: "Почта привязана. Подтверждение отправлено письмом.",
    emailInvalid: "Введи корректный email.",
    emailTaken: "Эта почта уже привязана к другому PRSLOY ID. Войди с ней или укажи другую.",
    emailRateLimited: "Слишком много попыток. Подожди немного и попробуй снова.",
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
    emailRequired: "Payment needs an email — link it in the field above.",
    genericError: "Could not create a payment. Try again or contact support.",
    emailStepLabel: "EMAIL FOR RECEIPTS",
    emailStepHint: "Payment receipts and service messages go here. We link it to your PRSLOY ID — then you can pay.",
    emailPlaceholder: "you@email.com",
    emailSubmit: "LINK EMAIL",
    emailSubmitting: "LINKING…",
    emailLinkedNote: "Email linked. A confirmation message is on its way.",
    emailInvalid: "Enter a valid email.",
    emailTaken: "This email is already attached to another PRSLOY ID. Sign in with it or use a different one.",
    emailRateLimited: "Too many attempts. Wait a bit and try again.",
  },
};

// Group thousands with a space: 3240 -> "3 240".
function fmtRub(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function PaymentCheckout({
  period,
  locale,
  emailMissing = false,
}: {
  period: Period;
  locale: string;
  emailMissing?: boolean;
}) {
  const copy = locale === "en" ? COPY.en : COPY.ru;
  const totalRub = getPeriodTotalRub(period);
  const totalUsd = getPeriodTotalUsd(period);
  const [state, setState] = useState<CheckoutState>({ kind: "idle" });
  const [error, setError] = useState("");
  const [needsAuth, setNeedsAuth] = useState(false);

  // Telegram-only accounts have no email, and payment creation requires one
  // (receipt + operator reach-out). The linking step replaces the pay buttons
  // until the address is attached — no dead-end 409 at the pay click.
  const [emailValue, setEmailValue] = useState("");
  const [emailError, setEmailError] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkedNow, setLinkedNow] = useState(false);
  const showEmailStep = emailMissing && !linkedNow;

  async function submitLinkEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (linking) return;

    const trimmed = emailValue.trim();
    if (!isValidEmail(trimmed)) {
      setEmailError(copy.emailInvalid);
      return;
    }

    setLinking(true);
    setEmailError("");
    try {
      const res = await fetch("/api/auth/link-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (res.ok && data.ok) {
        setLinkedNow(true);
        return;
      }
      // The account already has an email (stale prop) — the gate is
      // satisfied, so just reveal the pay buttons.
      if (data.error === "email_already_set") {
        setLinkedNow(true);
        return;
      }
      if (data.error === "email_exists") setEmailError(copy.emailTaken);
      else if (data.error === "invalid_email") setEmailError(copy.emailInvalid);
      else if (data.error === "rate_limited") setEmailError(copy.emailRateLimited);
      else setEmailError(copy.genericError);
    } catch {
      setEmailError(copy.genericError);
    } finally {
      setLinking(false);
    }
  }

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

  if (showEmailStep) {
    return (
      <form onSubmit={submitLinkEmail} className="flex flex-col gap-sm" noValidate>
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
            {copy.emailStepLabel}
          </span>
          <input
            type="email"
            autoComplete="email"
            required
            placeholder={copy.emailPlaceholder}
            value={emailValue}
            onChange={(e) => setEmailValue(e.target.value)}
            className="bg-surface border border-border-visible rounded-full px-lg min-h-[48px]
                       font-mono text-body text-text-display placeholder:text-text-disabled
                       focus:outline-none focus:border-text-display transition-colors"
          />
        </label>
        <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
          {copy.emailStepHint}
        </p>
        <button
          type="submit"
          disabled={linking}
          className="inline-flex min-h-[48px] items-center justify-center bg-text-display px-lg
                     font-mono text-label uppercase tracking-[0.08em] text-black rounded-full
                     enabled:hover:opacity-90 active:scale-[0.98]
                     transition disabled:opacity-60 disabled:cursor-wait"
        >
          <Bracketed>{linking ? copy.emailSubmitting : copy.emailSubmit}</Bracketed>
        </button>
        {emailError && (
          <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
            {emailError}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-sm">
      {linkedNow && (
        <p className="font-mono text-label uppercase tracking-[0.08em] text-text-secondary">
          {copy.emailLinkedNote}
        </p>
      )}
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
