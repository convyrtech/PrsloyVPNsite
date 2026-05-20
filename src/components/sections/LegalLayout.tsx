import { getTranslations } from "next-intl/server";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { DotoNumber } from "@/components/ui/DotoNumber";
import { TELEGRAM_BOT_URL } from "@/lib/links";

export type LegalKind = "privacy" | "terms" | "refunds";

export async function LegalLayout({ kind, locale }: { kind: LegalKind; locale: string }) {
  const t = await getTranslations({ locale, namespace: `legal.${kind}` });
  const sections = (t.raw("sections") as Array<{ h: string; p: string }>) ?? [];

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <article className="max-w-2xl mx-auto px-lg flex flex-col gap-2xl">
        <RevealOnView y={12}>
          <div className="flex items-center justify-between">
            <SectionLabel>{t("label")}</SectionLabel>
            <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
              {t("updated")}
            </span>
          </div>
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
              <DotoNumber value={String(sections.length).padStart(2, "0")} unit="SECTIONS" />
            </div>
            <p className="font-body text-body text-text-secondary leading-[1.55] max-w-xl">
              {t("intro")}
            </p>
          </header>
        </RevealOnView>

        <RevealOnView>
          <div className="h-px bg-border-visible/40" />
        </RevealOnView>

        {sections.map((section, i) => (
          <RevealOnView key={i} delay={0.04 * i} y={20}>
            <section className="flex flex-col gap-md">
              <h2 className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                {String(i + 1).padStart(2, "0")} · {section.h}
              </h2>
              <p className="font-body text-body text-text-secondary leading-[1.65]">
                {section.p}
              </p>
            </section>
          </RevealOnView>
        ))}

        <RevealOnView>
          <div className="pt-xl border-t border-border-visible flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
            <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
              {t("contact_label")}
            </span>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-[44px]
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:opacity-80 transition-opacity"
            >
              {t("contact_link")} →
            </a>
          </div>
        </RevealOnView>
      </article>
    </main>
  );
}
