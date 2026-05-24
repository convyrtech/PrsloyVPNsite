"use client";

import { Suspense, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { TELEGRAM_BOT_URL } from "@/lib/links";
import { PaymentCheckout } from "@/components/payments/PaymentCheckout";
import { PaymentResultBanner } from "@/components/payments/PaymentResultBanner";
import {
  type Period,
  PERIODS,
  PRICE_BY_PERIOD,
} from "@/lib/pricing";

// Placeholder until /api/capacity is wired. Specific (non-round) numbers
// read as real data and resist 'marketing-urgency' interpretation.
const CAPACITY_USED = 47;
const CAPACITY_TOTAL = 100;

export function PricingPageClient({ locale }: { locale: string }) {
  const t = useTranslations("pricing_page");
  const tShared = useTranslations("pricing");

  const [period, setPeriod] = useState<Period>("1mo");
  const basePrice = PRICE_BY_PERIOD[period];

  // SPEC rows. `featured` lifts opacity to text-display — three USP rows
  // anchor scanning, three generic rows fade to text-secondary.
  const specs: Array<{ label: string; value: string; featured: boolean }> = [
    { label: tShared("feature_encryption"), value: tShared("feature_encryption_value"), featured: true },
    { label: tShared("feature_devices"), value: tShared("feature_devices_value"), featured: false },
    { label: tShared("feature_speed"), value: tShared("feature_speed_value"), featured: true },
    { label: tShared("feature_servers"), value: tShared("feature_servers_value"), featured: true },
    { label: tShared("feature_logs"), value: tShared("feature_logs_value"), featured: false },
    { label: tShared("feature_support"), value: tShared("feature_support_value"), featured: false },
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

        {/* PRICE BLOCK — single column, left-aligned, no card chrome. */}
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
            <div className="flex items-baseline gap-md flex-wrap">
              <span
                className="font-display text-text-display leading-[0.85] tabular-nums"
                style={{
                  fontSize: "clamp(120px, 22vw, 220px)",
                  letterSpacing: "0.02em",
                }}
              >
                ${basePrice}
              </span>
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-secondary pb-lg">
                {t("monthly_unit")}
              </span>
            </div>

            <PaymentCheckout period={period} locale={locale} />
          </section>
        </RevealOnView>

        {/* SPEC block — numbered data-sheet, dividers between rows since the
            items are structurally identical (Nothing section 2.3). */}
        <RevealOnView>
          <section className="flex flex-col">
            <SectionDivider label="SPEC" />
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
          </section>
        </RevealOnView>

        {/* STATUS band. Real /api/capacity wiring later; the numbers below
            are a placeholder. */}
        <RevealOnView>
          <section className="flex items-center gap-md font-mono text-label uppercase tracking-[0.16em]">
            <span className="text-text-disabled">STATUS</span>
            <span className="flex-1 h-px bg-border-visible/40" />
            <span className="text-text-display tabular-nums">
              {CAPACITY_USED}/{CAPACITY_TOTAL} SLOTS ACTIVE
            </span>
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
