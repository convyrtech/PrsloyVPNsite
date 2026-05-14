import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { DotoNumber } from "@/components/ui/DotoNumber";
import { TELEGRAM_BOT_URL } from "@/lib/links";

type FaqItem = { category: string; q: string; a: string };

const CATEGORY_ORDER = ["product", "tech", "payment", "trust"] as const;

export default async function FaqPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "faq_page" });
  const tHeader = await getTranslations({ locale, namespace: "header" });

  const items = (t.raw("items") as FaqItem[]) ?? [];
  const categories = (t.raw("categories") as Record<string, string>) ?? {};

  const grouped = CATEGORY_ORDER.map((cat) => ({
    id: cat,
    label: categories[cat] ?? cat.toUpperCase(),
    items: items.filter((it) => it.category === cat),
  })).filter((g) => g.items.length > 0);

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-2xl mx-auto px-lg flex flex-col gap-3xl">
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
              <DotoNumber value={items.length} unit="Q&A" pulse pulseColor="bg-success" />
            </div>
            <p className="font-body text-body text-text-secondary leading-[1.55] max-w-xl">
              {t("subtitle")}
            </p>
          </header>
        </RevealOnView>

        {grouped.map((group, gi) => (
          <RevealOnView key={group.id} delay={0.05 * (gi + 1)}>
          <section className="flex flex-col gap-lg">
            <div className="flex items-center gap-md">
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                {group.label}
              </span>
              <span className="h-px flex-1 bg-border-visible/40" />
              <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
                {String(group.items.length).padStart(2, "0")}
              </span>
            </div>

            <div className="flex flex-col">
              {group.items.map((item, i) => (
                <div key={i} className={`flex gap-md ${i > 0 ? "pt-xl mt-xl border-t border-border-visible/40" : ""}`}>
                  <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled
                                   flex-shrink-0 pt-1 w-[24px]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="flex flex-col gap-sm flex-1">
                    <h2 className="font-body font-bold text-text-display text-subheading leading-[1.3]">
                      {item.q}
                    </h2>
                    <p className="font-body text-body text-text-secondary leading-[1.65]">
                      {item.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
          </RevealOnView>
        ))}

        <RevealOnView>
        <div className="pt-xl border-t border-border-visible flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
          <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
            {t("still_have")}
          </span>
          <div className="flex items-center gap-lg">
            <Link
              href="/pricing"
              className="inline-flex items-center min-h-[44px]
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:opacity-80 transition-opacity"
            >
              {tHeader("nav_pricing")} →
            </Link>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center min-h-[44px]
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:opacity-80 transition-opacity"
            >
              {t("telegram_link")} →
            </a>
          </div>
        </div>
        </RevealOnView>
      </div>
    </main>
  );
}
