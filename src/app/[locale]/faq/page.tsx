import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SectionLabel } from "@/components/ui/SectionLabel";
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
        <SectionLabel>{t("label")}</SectionLabel>

        <header className="flex flex-col gap-md">
          <h1
            className="font-body font-bold text-text-display leading-[1.05] tracking-[-0.02em] break-words"
            style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
          >
            {t("title")}
          </h1>
          <p className="font-body text-body text-text-secondary leading-[1.55]">
            {t("subtitle")}
          </p>
        </header>

        {grouped.map((group) => (
          <section key={group.id} className="flex flex-col gap-lg">
            <div className="flex items-center gap-md">
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                {group.label}
              </span>
              <span className="h-px flex-1 bg-border-visible/40" />
              <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
                {String(group.items.length).padStart(2, "0")}
              </span>
            </div>

            <div className="flex flex-col gap-xl">
              {group.items.map((item, i) => (
                <div key={i} className="flex flex-col gap-sm">
                  <h2 className="font-body font-bold text-text-display text-subheading leading-[1.3]">
                    {item.q}
                  </h2>
                  <p className="font-body text-body text-text-secondary leading-[1.65]">
                    {item.a}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="pt-xl border-t border-border-visible flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
          <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
            {t("still_have")}
          </span>
          <div className="flex items-center gap-lg">
            <Link
              href="/pricing"
              className="font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:opacity-80 transition-opacity"
            >
              {tHeader("nav_pricing")} →
            </Link>
            <a
              href={TELEGRAM_BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:opacity-80 transition-opacity"
            >
              {t("telegram_link")} →
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
