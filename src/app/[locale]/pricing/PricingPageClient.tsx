"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PaymentPills } from "@/components/pricing/PaymentPills";
import { FeatureCell } from "@/components/pricing/FeatureCell";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { DividerLabel } from "@/components/ui/DividerLabel";
import { TELEGRAM_BOT_URL } from "@/lib/links";
import { isValidEmail } from "@/lib/validation";
import {
  type Period,
  type Payment,
  PERIODS,
  PRICE_BY_PERIOD,
  formatConversion,
} from "@/lib/pricing";

type FormState = "idle" | "submitting" | "success" | "error";

export function PricingPageClient({ locale }: { locale: string }) {
  const t = useTranslations("pricing_page");
  const tShared = useTranslations("pricing");

  const [period, setPeriod] = useState<Period>("1mo");
  const [payment, setPayment] = useState<Payment>("SBP");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<FormState>("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");

  const basePrice = PRICE_BY_PERIOD[period];
  const conversionText = formatConversion(period, payment);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "submitting") return;

    const trimmed = email.trim();
    if (!isValidEmail(trimmed)) {
      setErrorMsg(t("error_invalid_email"));
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, period, payment, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        if (data.error === "invalid_email") {
          setErrorMsg(t("error_invalid_email"));
        } else {
          setErrorMsg(t("error_description"));
        }
        setState("error");
        return;
      }
      setState("success");
    } catch {
      setErrorMsg(t("error_description"));
      setState("error");
    }
  }

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-2xl mx-auto px-lg flex flex-col gap-3xl">
        <SectionLabel>{t("label")}</SectionLabel>

        <header className="flex flex-col gap-md">
          <h1
            className="font-body font-bold text-text-display leading-[1.05] tracking-[-0.02em] break-words"
            style={{ fontSize: "clamp(28px, 6vw, 56px)" }}
          >
            <span className="block">{t("headline_line1")}</span>
            <span className="block text-text-secondary">{t("headline_line2")}</span>
          </h1>
          <p className="font-mono text-body-sm uppercase tracking-[0.08em] text-text-disabled">
            {t("subheadline")}
          </p>
        </header>

        <section className="border border-border-visible rounded-[24px] p-2xl flex flex-col gap-xl">
          <PeriodSwitcher
            value={period}
            onChange={setPeriod}
            labels={{
              "1mo": tShared("period_1m"),
              "6mo": tShared("period_6m"),
              "1yr": tShared("period_12m"),
            }}
          />

          <div className="flex flex-col items-center gap-sm">
            <div
              className="font-body font-bold text-text-display leading-[0.85] tabular-nums flex items-baseline"
              style={{ fontSize: "clamp(96px, 18vw, 180px)", letterSpacing: "-0.05em" }}
            >
              <span>$</span>
              <span>{basePrice}</span>
            </div>
            <p className="font-mono text-label uppercase tracking-[0.12em] text-text-secondary">
              {tShared("per_month")}
            </p>
            <div className="flex items-center gap-sm mt-sm">
              <span className="inline-block w-[6px] h-[6px] rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-label uppercase tracking-[0.12em] text-accent">
                {t("promo_strip")}
              </span>
            </div>
          </div>

          {/* PAYMENT METHODS — visible but disabled until Rollypay */}
          <div className="flex flex-col items-center gap-sm">
            <PaymentPills value={payment} onChange={setPayment} />
            <div className="font-mono text-body-sm text-text-secondary tracking-[0.04em]">
              {conversionText}
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-md">
          <DividerLabel>{tShared("includes")}</DividerLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-xl gap-y-md">
            <FeatureCell label={tShared("feature_encryption")} value={tShared("feature_encryption_value")} />
            <FeatureCell label={tShared("feature_devices")}    value={tShared("feature_devices_value")} />
            <FeatureCell label={tShared("feature_speed")}      value={tShared("feature_speed_value")} />
            <FeatureCell label={tShared("feature_servers")}    value={tShared("feature_servers_value")} />
            <FeatureCell label={tShared("feature_logs")}       value={tShared("feature_logs_value")} />
            <FeatureCell label={tShared("feature_support")}    value={tShared("feature_support_value")} />
          </div>
        </section>

        <section className="flex flex-col gap-lg border border-border-visible rounded-[24px] p-2xl">
          <DividerLabel>{t("waitlist_label")}</DividerLabel>
          <h2 className="font-body font-bold text-text-display text-heading">
            {t("waitlist_title")}
          </h2>
          <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
            {t("waitlist_description")}
          </p>

          {state !== "success" ? (
            <form onSubmit={handleSubmit} className="flex flex-col gap-md" noValidate>
              <div className="flex flex-col sm:flex-row gap-sm">
                <input
                  type="email"
                  name="email"
                  required
                  inputMode="email"
                  autoComplete="email"
                  placeholder={t("email_placeholder")}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (state === "error") setState("idle");
                  }}
                  disabled={state === "submitting"}
                  className="flex-1 bg-black border border-border-visible rounded-full
                             px-lg min-h-[44px] font-mono text-body-sm tracking-[0.02em]
                             text-text-display placeholder:text-text-disabled
                             focus:outline-none focus:border-text-display
                             disabled:opacity-60
                             transition-colors duration-150 ease-out-nothing"
                />
                <button
                  type="submit"
                  disabled={state === "submitting"}
                  className="bg-text-display text-black font-mono uppercase tracking-[0.08em]
                             px-xl min-h-[44px] inline-flex items-center justify-center
                             rounded-full text-label
                             hover:opacity-90 active:scale-[0.98]
                             disabled:opacity-60 disabled:cursor-wait
                             transition-all duration-150 ease-out-nothing
                             whitespace-nowrap"
                >
                  [ {state === "submitting" ? t("submitting") : t("submit")} ]
                </button>
              </div>
              <p className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
                {t("no_spam")}
              </p>
              {state === "error" && (
                <div role="alert" className="flex flex-col gap-1 mt-xs">
                  <span className="font-mono text-label uppercase tracking-[0.08em] text-accent">
                    {t("error_title")}
                  </span>
                  <span className="font-body text-body-sm text-text-secondary">
                    {errorMsg || t("error_description")}
                  </span>
                </div>
              )}
            </form>
          ) : (
            <div role="status" className="flex flex-col gap-sm">
              <div className="flex items-center gap-sm">
                <span className="inline-block w-[8px] h-[8px] rounded-full bg-success" />
                <span className="font-mono text-body-sm uppercase tracking-[0.08em] text-text-display">
                  {t("success_title")}
                </span>
              </div>
              <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
                {t("success_description")}
              </p>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-lg">
          <DividerLabel>{t("how_label")}</DividerLabel>
          <ol className="flex flex-col gap-lg">
            <Step n="01" title={t("step_1_title")} body={t("step_1_body")} />
            <Step n="02" title={t("step_2_title")} body={t("step_2_body")} />
            <Step n="03" title={t("step_3_title")} body={t("step_3_body")} />
          </ol>
        </section>

        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md
                            pt-xl border-t border-border-visible">
          <div className="flex items-center gap-sm font-mono text-label uppercase tracking-[0.08em]">
            <span className="text-text-disabled">{t("faq_label")}</span>
            <Link href="/faq" className="inline-flex items-center min-h-[44px] text-text-display hover:opacity-80 transition-opacity">
              {t("faq_link")} →
            </Link>
          </div>
          <div className="flex items-center gap-sm font-mono text-label uppercase tracking-[0.08em]">
            <span className="text-text-disabled">{t("telegram_label")}</span>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-[44px] text-text-display hover:opacity-80 transition-opacity"
            >
              {t("telegram_link")} →
            </a>
          </div>
        </section>
      </div>
    </main>
  );
}

function PeriodSwitcher({
  value,
  onChange,
  labels,
}: {
  value: Period;
  onChange: (v: Period) => void;
  labels: Record<Period, string>;
}) {
  return (
    <div className="self-center inline-flex border border-border-visible rounded-full p-[3px]">
      {PERIODS.map((id) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`
              px-lg min-h-[44px] inline-flex items-center justify-center
              font-mono text-label uppercase tracking-[0.08em] rounded-full
              transition-colors duration-200 ease-out-nothing
              ${active
                ? "bg-text-display text-black"
                : "text-text-secondary hover:text-text-primary"}
            `}
          >
            {labels[id]}
          </button>
        );
      })}
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-lg">
      <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled
                       pt-1 w-[32px] flex-shrink-0">
        {n}
      </span>
      <div className="flex flex-col gap-1">
        <h3 className="font-body font-bold text-text-display text-subheading">{title}</h3>
        <p className="font-body text-body-sm text-text-secondary leading-[1.55]">{body}</p>
      </div>
    </li>
  );
}
