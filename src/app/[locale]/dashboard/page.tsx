import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";

const FEATURES = [
  "status",
  "renew",
  "regen",
  "config",
  "support",
  "history",
] as const;

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
        {/* ─── LABEL ─── */}
        <div className="flex items-center gap-md">
          <span className="inline-block w-[28px] h-px bg-border-visible" />
          <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
            {t("label")}
          </span>
        </div>

        {/* ─── HEADLINE ─── */}
        <header className="flex flex-col gap-md">
          <h1
            className="font-body font-bold text-text-display leading-[1.05] tracking-[-0.02em] break-words"
            style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
          >
            {t("title")}
          </h1>
          <p className="font-body text-body text-text-secondary leading-[1.55] max-w-2xl">
            {t("subtitle")}
          </p>
        </header>

        {/* ─── PRIMARY CTA ─── */}
        <section className="border border-border-visible rounded-[24px] p-2xl bg-surface
                            flex flex-col items-center text-center gap-md">
          <a
            href="https://t.me/prsloy_bot"
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

        {/* ─── WHAT'S INSIDE ─── */}
        <section className="flex flex-col gap-lg">
          <div className="flex items-center gap-md">
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
              {t("what_label")}
            </span>
            <span className="h-px flex-1 bg-border-visible/40" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-md">
            {FEATURES.map((id) => (
              <article
                key={id}
                className="flex flex-col gap-sm border border-border-visible rounded-[16px] p-lg"
              >
                <h3 className="font-body font-bold text-text-display text-subheading leading-[1.3]">
                  {t(`feature_${id}_title`)}
                </h3>
                <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
                  {t(`feature_${id}_body`)}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ─── WEB DASHBOARD SOON ─── */}
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

        {/* ─── FOOTER LINK ─── */}
        <div className="pt-xl border-t border-border-visible flex items-center gap-sm
                        font-mono text-label uppercase tracking-[0.08em]">
          <span className="text-text-disabled">{t("no_key_label")}</span>
          <Link
            href="/pricing"
            className="text-text-display hover:opacity-80 transition-opacity"
          >
            {t("get_key_link")} →
          </Link>
        </div>
      </div>
    </main>
  );
}
