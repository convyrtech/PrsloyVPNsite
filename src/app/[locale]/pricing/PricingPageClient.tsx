"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { TELEGRAM_BOT_URL } from "@/lib/links";
import { PaymentCheckout } from "@/components/payments/PaymentCheckout";
import { PaymentResultBanner } from "@/components/payments/PaymentResultBanner";
import { AnimatedPrice } from "@/components/pricing/AnimatedPrice";
import {
  type Period,
  PERIODS,
  PRICE_RUB_BY_PERIOD,
  getMonthlyPriceRub,
  formatPeriodTotal,
} from "@/lib/pricing";

export function PricingPageClient({
  locale,
  authed,
  emailMissing,
}: {
  locale: string;
  authed: boolean;
  emailMissing: boolean;
}) {
  const t = useTranslations("pricing_page");
  const tShared = useTranslations("pricing");

  const [period, setPeriod] = useState<Period>("1mo");
  const savePct = Math.round((1 - PRICE_RUB_BY_PERIOD[period] / PRICE_RUB_BY_PERIOD["1mo"]) * 100);
  // "ЧТО ВНУТРИ" rows — trimmed to the four differentiators (own servers,
  // clean addresses, no logs, unlimited traffic). `featured` lifts the three
  // strongest to text-display. (Key names predate the copy; values are truth.)
  const specs: Array<{ label: string; value: string; featured: boolean }> = [
    { label: tShared("feature_encryption"), value: tShared("feature_encryption_value"), featured: true },
    { label: tShared("feature_speed"), value: tShared("feature_speed_value"), featured: true },
    { label: tShared("feature_servers"), value: tShared("feature_servers_value"), featured: true },
    { label: tShared("feature_devices"), value: tShared("feature_devices_value"), featured: false },
  ];

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-3xl mx-auto px-lg flex flex-col gap-3xl">
        <Suspense>
          <PaymentResultBanner />
        </Suspense>

        <RevealOnView y={12}>
          <SectionLabel>{t("label")}</SectionLabel>
        </RevealOnView>

        <RevealOnView delay={0.05}>
          <header className="flex flex-col gap-lg">
            <h1
              className="font-body font-bold text-text-display leading-[0.95] tracking-[-0.03em] break-words"
              style={{ fontSize: "clamp(28px, 5vw, 56px)" }}
            >
              <span className="block">{t("headline_line1")}</span>
              {t("headline_line2") && (
                <span className="block text-text-secondary">{t("headline_line2")}</span>
              )}
            </h1>
            <p className="font-mono text-body-sm uppercase tracking-[0.08em] text-text-disabled max-w-md">
              {t("subheadline")}
            </p>
          </header>
        </RevealOnView>

        <RevealOnView delay={0.1}>
          <section className="flex flex-col gap-xl">
            <PeriodSwitcher
              value={period}
              onChange={setPeriod}
              labels={{
                "1mo": tShared("period_1m"),
                "6mo": tShared("period_6m"),
                "1yr": tShared("period_12m"),
              }}
            />

            {/* $5 + 'в месяц' caption: instrument readout with unit beside,
                baseline-aligned. Doto for the digits — the one moment per
                screen (Nothing section 2.8 #5). */}
            <div className="flex flex-col gap-sm">
              <div className="flex items-baseline gap-sm flex-wrap">
                {/* Digits in Doto (the one display moment) — riffle-decode on
                    period change + slow ambient glow. Currency kept out of
                    Doto (it lacks a ₽ glyph): ₽ in the body font beside it. */}
                <AnimatedPrice
                  value={getMonthlyPriceRub(period)}
                  className="font-display text-text-display leading-[0.85] tabular-nums"
                  style={{
                    fontSize: "clamp(96px, 19vw, 200px)",
                    letterSpacing: "0.02em",
                  }}
                />
                <span
                  className="font-body font-light text-text-display leading-[0.85]"
                  style={{ fontSize: "clamp(56px, 11vw, 120px)" }}
                >
                  ₽
                </span>
                <span className="font-mono text-label uppercase tracking-[0.16em] text-text-secondary pb-lg">
                  {t("monthly_unit")}
                </span>
              </div>
              {period !== "1mo" && (
                <p className="font-mono text-label uppercase tracking-[0.16em] text-text-secondary">
                  {t("total_label")} {formatPeriodTotal(period)}
                  <span className="text-accent"> · −{savePct}%</span>
                </p>
              )}
            </div>

            {/* One checkout for everyone: a guest fills email + password
                right here and the pay click registers, signs in and opens the
                provider in a single action. No detour through /register. */}
            <PaymentCheckout
              period={period}
              locale={locale}
              authed={authed}
              emailMissing={emailMissing}
            />

            {/* The policy pages have to be reachable from the payment screen
                itself, not only from the landing footer — the checkout is
                where the buyer agrees to them. */}
            <p className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled leading-[1.6]">
              {t.rich("legal_consent", {
                terms: (chunks) => <LegalRef href="/terms">{chunks}</LegalRef>,
                privacy: (chunks) => <LegalRef href="/privacy">{chunks}</LegalRef>,
                refunds: (chunks) => <LegalRef href="/refunds">{chunks}</LegalRef>,
              })}
            </p>
          </section>
        </RevealOnView>

        {/* CAPACITY HEADROOM — the rationale (deliberate headroom keeps speed
            and clean addresses): answers the buyer's unspoken "will this stay
            fast and clean" right at the decision point. Followed by the
            trimmed data-sheet of what's actually included. */}
        <RevealOnView>
          <section className="flex flex-col gap-2xl">
            <div className="flex flex-col">
              <SectionDivider label={t("why_label")} />
              <div className="flex flex-col gap-md font-body text-body-sm text-text-secondary leading-[1.6] max-w-2xl">
                <p>{t("why_line1")}</p>
                <p>{t("why_line2")}</p>
              </div>
            </div>

            <div className="flex flex-col">
              <SectionDivider label={t("whats_inside_label")} />
              <ol className="flex flex-col">
                {specs.map((spec, i) => (
                  <SpecRow
                    key={spec.label}
                    num={String(i + 1).padStart(2, "0")}
                    label={spec.label}
                    value={spec.value}
                    featured={spec.featured}
                  />
                ))}
              </ol>
            </div>
          </section>
        </RevealOnView>

        {/* Utility nav. */}
        <RevealOnView>
          <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md
                              pt-xl border-t border-border-visible">
            <UtilityLink
              label={t("faq_label")}
              href="/faq"
              text={t("faq_link")}
              internal
            />
            <UtilityLink
              label={t("refunds_label")}
              href="/refunds"
              text={t("refunds_link")}
              internal
            />
            <UtilityLink
              label={t("telegram_label")}
              href={TELEGRAM_BOT_URL}
              text={t("telegram_link")}
            />
          </section>
        </RevealOnView>
      </div>
    </main>
  );
}

function LegalRef({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href as "/terms"}
      className="text-text-secondary underline underline-offset-4 hover:text-text-display transition-colors"
    >
      {children}
    </Link>
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
    <div className="self-start inline-flex border border-border-visible rounded-full p-[3px]">
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

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-md pb-md mb-md border-b border-border-visible
                    font-mono text-label uppercase tracking-[0.16em]">
      <span className="text-text-display">{label}</span>
      <span className="flex-1 h-px bg-border-visible/40" />
    </div>
  );
}

function SpecRow({
  num,
  label,
  value,
  featured,
}: {
  num: string;
  label: string;
  value: string;
  featured: boolean;
}) {
  // Opacity hierarchy (Nothing section 2.5): featured rows pop on
  // text-display, generic rows fade to text-secondary. No emphasis 'moment' —
  // the Doto price already owns the single break-the-pattern slot per screen.
  const tone = featured ? "text-text-display" : "text-text-secondary";
  return (
    <li
      className={`grid grid-cols-[36px_1fr_auto] items-baseline gap-md py-md
                  border-b border-border-visible/40 last:border-b-0
                  font-mono text-label uppercase tracking-[0.08em] ${tone}`}
    >
      <span className="text-text-disabled tabular-nums">{num}</span>
      <span>{label}</span>
      <span className="text-right">{value}</span>
    </li>
  );
}

function UtilityLink({
  label,
  href,
  text,
  internal,
}: {
  label: string;
  href: string;
  text: string;
  internal?: boolean;
}) {
  const className =
    "inline-flex items-center min-h-[44px] text-text-display hover:opacity-80 transition-opacity";
  return (
    <div className="flex items-center gap-sm font-mono text-label uppercase tracking-[0.08em]">
      <span className="text-text-disabled">{label}</span>
      {internal ? (
        <Link href={href as "/faq"} className={className}>
          {text} {"→"}
        </Link>
      ) : (
        <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
          {text} {"→"}
        </a>
      )}
    </div>
  );
}
