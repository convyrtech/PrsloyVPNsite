"use client";

import { useRef, useState } from "react";
import { Link } from "@/i18n/routing";
import { Bracketed } from "@/components/ui/Bracketed";
import { type Period, getPeriodTotalRub } from "@/lib/pricing";
import type { PaymentMethod } from "@/lib/payments";
import { readUtmSource } from "@/lib/client-utm";
import { isValidEmail } from "@/lib/validation";
import { DottedSnakeBorder } from "@/components/ui/DottedSnakeBorder";

type CheckoutState =
  | { kind: "idle" }
  | { kind: "loading"; method: PaymentMethod }
  | { kind: "error" };

const MIN_PASSWORD = 8;

type Copy = {
  paySbp: string;
  payCrypto: string;
  loadingSbp: string;
  loadingCrypto: string;
  login: string;
  configError: string;
  genericError: string;
  rateLimited: string;
  // Guest checkout — account is created by the pay click.
  guestEmailLabel: string;
  guestPasswordLabel: string;
  guestEmailPlaceholder: string;
  guestPasswordPlaceholder: string;
  guestHint: string;
  emailInvalid: string;
  passwordShort: string;
  wrongPassword: string;
  // Telegram-only accounts: email is linked before the pay buttons appear.
  emailStepLabel: string;
  emailStepHint: string;
  emailSubmit: string;
  emailSubmitting: string;
  emailLinkedNote: string;
  emailTaken: string;
};

const COPY: Record<"ru" | "en", Copy> = {
  ru: {
    paySbp: "Оплатить СБП",
    payCrypto: "Оплатить USDT",
    loadingSbp: "Создаём СБП-платёж...",
    loadingCrypto: "Создаём крипто-платёж...",
    login: "Войти",
    configError: "Оплата временно недоступна. Напиши в поддержку.",
    genericError: "Не получилось создать платеж. Попробуй еще раз или напиши в поддержку.",
    rateLimited: "Слишком много попыток. Подожди немного и попробуй снова.",
    guestEmailLabel: "ПОЧТА",
    guestPasswordLabel: "ПАРОЛЬ",
    guestEmailPlaceholder: "you@email.com",
    guestPasswordPlaceholder: "минимум 8 символов",
    guestHint: "Аккаунт создаётся этой же кнопкой — почта нужна для чека и входа в кабинет. Уже есть аккаунт: введи его почту и пароль.",
    emailInvalid: "Введи корректный email.",
    passwordShort: "Пароль — от 8 до 128 символов.",
    wrongPassword: "Эта почта уже занята, а пароль не подошёл.",
    emailStepLabel: "ПОЧТА ДЛЯ ЧЕКА",
    emailStepHint: "Сюда придёт чек об оплате и служебные письма. Привяжем к твоему PRSLOY ID — и можно платить.",
    emailSubmit: "ПРИВЯЗАТЬ ПОЧТУ",
    emailSubmitting: "ПРИВЯЗЫВАЕМ…",
    emailLinkedNote: "Почта привязана. Подтверждение отправлено письмом.",
    emailTaken: "Эта почта уже привязана к другому PRSLOY ID. Войди с ней или укажи другую.",
  },
  en: {
    paySbp: "Pay with SBP",
    payCrypto: "Pay with USDT",
    loadingSbp: "Creating SBP payment...",
    loadingCrypto: "Creating crypto payment...",
    login: "Sign in",
    configError: "Payment is temporarily unavailable. Message support.",
    genericError: "Could not create a payment. Try again or contact support.",
    rateLimited: "Too many attempts. Wait a bit and try again.",
    guestEmailLabel: "EMAIL",
    guestPasswordLabel: "PASSWORD",
    guestEmailPlaceholder: "you@email.com",
    guestPasswordPlaceholder: "8 characters minimum",
    guestHint: "The same button creates the account — the address carries your receipt and your sign-in. Already have one: use its email and password.",
    emailInvalid: "Enter a valid email.",
    passwordShort: "Password must be 8 to 128 characters.",
    wrongPassword: "This email is taken and the password did not match.",
    emailStepLabel: "EMAIL FOR RECEIPTS",
    emailStepHint: "Payment receipts and service messages go here. We link it to your PRSLOY ID — then you can pay.",
    emailSubmit: "LINK EMAIL",
    emailSubmitting: "LINKING…",
    emailLinkedNote: "Email linked. A confirmation message is on its way.",
    emailTaken: "This email is already attached to another PRSLOY ID. Sign in with it or use a different one.",
  },
};

// Group thousands with a space: 3240 -> "3 240".
function fmtRub(n: number): string {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export function PaymentCheckout({
  period,
  locale,
  authed,
  emailMissing = false,
}: {
  period: Period;
  locale: string;
  authed: boolean;
  emailMissing?: boolean;
}) {
  const copy = locale === "en" ? COPY.en : COPY.ru;
  const totalRub = getPeriodTotalRub(period);
  const [state, setState] = useState<CheckoutState>({ kind: "idle" });
  const busy = useRef(false);
  const [error, setError] = useState("");
  const [showLoginLink, setShowLoginLink] = useState(false);

  // Guest checkout: the pay click registers (or signs in) and then opens the
  // provider. `hasAccount` flips once the session exists, so a retry after a
  // provider hiccup does not try to register the same address twice.
  const [hasAccount, setHasAccount] = useState(authed);
  const [emailValue, setEmailValue] = useState("");
  const [passwordValue, setPasswordValue] = useState("");

  // Telegram-only accounts have no email, and payment creation requires one
  // (receipt + operator reach-out). The linking step replaces the pay buttons
  // until the address is attached — no dead-end 409 at the pay click.
  const [linking, setLinking] = useState(false);
  const [linkedNow, setLinkedNow] = useState(false);
  const showEmailStep = authed && emailMissing && !linkedNow;

  async function submitLinkEmail(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (linking) return;

    const trimmed = emailValue.trim();
    if (!isValidEmail(trimmed)) {
      setError(copy.emailInvalid);
      return;
    }

    setLinking(true);
    setError("");
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

      // `email_already_set` means a stale prop, not a failure — the gate is
      // satisfied either way, so reveal the pay buttons.
      if ((res.ok && data.ok) || data.error === "email_already_set") {
        setLinkedNow(true);
        return;
      }
      if (data.error === "email_exists") setError(copy.emailTaken);
      else if (data.error === "invalid_email") setError(copy.emailInvalid);
      else if (data.error === "rate_limited") setError(copy.rateLimited);
      else setError(copy.genericError);
    } catch {
      setError(copy.genericError);
    } finally {
      setLinking(false);
    }
  }

  // Registers the guest, or signs them in when the address is already taken.
  // Returns true once a session cookie is set and checkout may proceed.
  async function ensureAccount(utmSource: string | undefined): Promise<boolean> {
    const email = emailValue.trim();
    if (!isValidEmail(email)) {
      setError(copy.emailInvalid);
      return false;
    }
    if (passwordValue.length < MIN_PASSWORD) {
      setError(copy.passwordShort);
      return false;
    }

    const register = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password: passwordValue,
        locale,
        ...(utmSource ? { utmSource } : {}),
      }),
    });
    const registerData = (await register.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (register.ok && registerData.ok) {
      setHasAccount(true);
      return true;
    }

    // Returning buyer typed their existing address — sign them in with the
    // same pair instead of bouncing them to /login.
    if (registerData.error === "email_exists") {
      const login = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password: passwordValue }),
      });
      const loginData = (await login.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (login.ok && loginData.ok) {
        setHasAccount(true);
        return true;
      }
      if (loginData.error === "rate_limited") setError(copy.rateLimited);
      else {
        setError(copy.wrongPassword);
        setShowLoginLink(true);
      }
      return false;
    }

    if (registerData.error === "invalid_password") setError(copy.passwordShort);
    else if (registerData.error === "invalid_email") setError(copy.emailInvalid);
    else if (registerData.error === "rate_limited") setError(copy.rateLimited);
    else setError(copy.genericError);
    return false;
  }

  async function startPayment(method: PaymentMethod) {
    // A ref, not the `loading` state: two taps inside one frame both read the
    // pre-render state, and the guest path now awaits register (and maybe
    // login) before the order, so a slipped second run could mint a duplicate
    // account and a duplicate order.
    if (busy.current) return;
    busy.current = true;
    setState({ kind: "loading", method });
    setError("");
    setShowLoginLink(false);

    try {
      const utmSource = readUtmSource();

      if (!hasAccount && !(await ensureAccount(utmSource))) {
        setState({ kind: "error" });
        busy.current = false;
        return;
      }

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
        // Leave the guard closed: the tab is navigating to the provider.
        window.location.href = data.paymentUrl;
        return;
      }

      if (data.error === "platega_not_configured") {
        setError(copy.configError);
      } else if (data.error === "rate_limited") {
        setError(copy.rateLimited);
      } else {
        // Includes the session we just created going missing — the login link
        // below is the way out.
        setError(copy.genericError);
        setShowLoginLink(data.error === "authentication_required");
      }
      setState({ kind: "error" });
      busy.current = false;
    } catch {
      setError(copy.genericError);
      setState({ kind: "error" });
      busy.current = false;
    }
  }

  const loadingMethod = state.kind === "loading" ? state.method : null;
  const isLoading = state.kind === "loading";

  if (showEmailStep) {
    return (
      <form onSubmit={submitLinkEmail} className="flex flex-col gap-sm" noValidate>
        <Field
          label={copy.emailStepLabel}
          type="email"
          autoComplete="email"
          placeholder={copy.guestEmailPlaceholder}
          value={emailValue}
          onChange={setEmailValue}
        />
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
        {error && (
          <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
            {error}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-sm">
      {!hasAccount && (
        <div className="flex flex-col gap-sm mb-sm">
          <Field
            label={copy.guestEmailLabel}
            type="email"
            autoComplete="email"
            placeholder={copy.guestEmailPlaceholder}
            value={emailValue}
            onChange={setEmailValue}
          />
          <Field
            label={copy.guestPasswordLabel}
            type="password"
            autoComplete="current-password"
            placeholder={copy.guestPasswordPlaceholder}
            value={passwordValue}
            onChange={setPasswordValue}
          />
          <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
            {copy.guestHint}
          </p>
        </div>
      )}
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
        <Bracketed>{loadingMethod === "crypto" ? copy.loadingCrypto : `${copy.payCrypto} · ${fmtRub(totalRub)} ₽`}</Bracketed>
      </button>

      {error && (
        <div className="flex flex-col gap-sm">
          <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
            {error}
          </p>
          {showLoginLink && (
            <Link
              href="/login"
              className="self-start inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:border-text-display transition-colors"
            >
              [ {copy.login} ]
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  type,
  autoComplete,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  type: "email" | "password";
  autoComplete: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      <input
        type={type}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-surface border border-border-visible rounded-full px-lg min-h-[48px]
                   font-mono text-body text-text-display placeholder:text-text-disabled
                   focus:outline-none focus:border-text-display transition-colors"
      />
    </label>
  );
}
