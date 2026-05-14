import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { DotoNumber } from "@/components/ui/DotoNumber";
import { TELEGRAM_BOT_URL } from "@/lib/links";

// Status indicator per feature — first two get green pulse (live), rest are
// quiet utilities. Breaks the 6-uniform-cards grid into one moment of
// instrumentation accent (Section 2.6: variance in exactly one place).
const FEATURES: { id: string; pulse: boolean }[] = [
  { id: "status",  pulse: true },
  { id: "renew",   pulse: true },
  { id: "regen",   pulse: false },
  { id: "config",  pulse: false },
  { id: "support", pulse: false },
  { id: "history", pulse: false },
];

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "dashboard_page" });

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-3xl mx-auto px-lg flex flex-col gap-3xl">
        <RevealOnView y={12}>
          <SectionLabel>{t("label")}</SectionLabel>
        </RevealOnView>

        <RevealOnView delay={0.05}>
          <header className="flex flex-col gap-lg">
            <div className="flex items-end justify-between gap-lg flex-wrap">
              <h1
                className="font-body font-bold text-text-display leading-[0.95] tracking-[-0.03em] break-words flex-1 min-w-0"
                style={{ fontSize: "clamp(36px, 7vw, 72px)" }}
              >
                {t("title")}
              </h1>
              <DotoNumber value="06" unit="OPS" />
            </div>
            <p className="font-body text-body text-text-secondary leading-[1.55] max-w-2xl">
              {t("subtitle")}
            </p>
          </header>
        </RevealOnView>

        <RevealOnView delay={0.1}>
        <section className="border border-border-visible rounded-[24px] p-2xl bg-surface
                            flex flex-col items-center text-center gap-md">
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block bg-text-display text-black
                       font-mono uppercase tracking-[0.08em] text-body-sm
                       px-2xl py-md rounded-full
                       hover:opacity-90 active:scale-[0.98]
                       transition-all duration-150 ease-out-nothing"
          >
            [ {t("telegram_cta_label")} ]
          </a>
          <p className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
            {t("telegram_cta_meta")}
          </p>
        </section>
        </RevealOnView>

        <RevealOnView>
        <section className="flex flex-col gap-lg">
          <div className="flex items-center gap-md">
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
              {t("what_label")}
            </span>
            <span className="h-px flex-1 bg-border-visible/40" />
            <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
              {String(FEATURES.length).padStart(2, "0")}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            {FEATURES.map((feat, i) => (
              <RevealOnView key={feat.id} delay={0.04 * i} y={16}>
              <article
                className="flex flex-col gap-sm border border-border-visible rounded-[16px] p-lg h-full"
              >
                <div className="flex items-center gap-sm">
                  {feat.pulse && (
                    <span className="inline-block w-[6px] h-[6px] rounded-full bg-success animate-pulse shrink-0" />
                  )}
                  <h3 className="font-body font-bold text-text-display text-subheading leading-[1.3]">
                    {t(`feature_${feat.id}_title`)}
                  </h3>
                </div>
                <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
                  {t(`feature_${feat.id}_body`)}
                </p>
              </article>
              </RevealOnView>
            ))}
          </div>
        </section>
        </RevealOnView>

        <RevealOnView>
        <section className="border border-dashed border-border-visible rounded-[20px] p-xl
                            flex flex-col gap-md">
          <div className="flex items-center gap-sm">
            <span className="inline-block w-[6px] h-[6px] rounded-full bg-warning animate-pulse" />
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
              {t("web_soon_label")}
            </span>
          </div>
          <p className="font-body text-body-sm text-text-secondary leading-[1.65]">
            {t("web_soon_body")}
          </p>
        </section>
        </RevealOnView>

        <RevealOnView>
        <div className="pt-xl border-t border-border-visible flex items-center gap-sm
                        font-mono text-label uppercase tracking-[0.08em]">
          <span className="text-text-disabled">{t("no_key_label")}</span>
          <Link
            href="/pricing"
            className="inline-flex items-center min-h-[44px] text-text-display hover:opacity-80 transition-opacity"
          >
            {t("get_key_link")} →
          </Link>
        </div>
        </RevealOnView>
      </div>
    </main>
  );
}
