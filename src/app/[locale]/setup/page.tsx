import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { TELEGRAM_BOT_URL } from "@/lib/links";

type StepLink = { label: string; url: string };
type Step = { title: string; body: string; links: StepLink[] };

export default async function SetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "setup_page" });

  const steps = (t.raw("steps") as Step[]) ?? [];

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

        <ol className="flex flex-col gap-2xl">
          {steps.map((step, i) => (
            <li key={i} className="flex flex-col gap-md border border-border-visible rounded-[20px] p-xl">
              <div className="flex items-center gap-md">
                <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
                  {t("step_label_prefix")} {String(i + 1).padStart(2, "0")}
                </span>
                <span className="h-px flex-1 bg-border-visible/40" />
              </div>
              <h2 className="font-body font-bold text-text-display text-heading leading-[1.2]">
                {step.title}
              </h2>
              <p className="font-body text-body text-text-secondary leading-[1.65]">
                {step.body}
              </p>
              {step.links.length > 0 && (
                <div className="flex flex-wrap gap-sm mt-sm">
                  {step.links.map((lnk, li) => (
                    <a
                      key={li}
                      href={lnk.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono text-label uppercase tracking-[0.08em]
                                 border border-border-visible rounded-full px-md py-2
                                 text-text-display
                                 hover:border-text-display transition-colors duration-150"
                    >
                      {lnk.label} →
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>

        <section className="flex flex-col gap-md p-xl bg-surface rounded-[20px]">
          <h3 className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
            {t("troubleshooting_label")}
          </h3>
          <p className="font-body text-body text-text-secondary leading-[1.65]">
            {t("troubleshooting_body")}
          </p>
        </section>

        <div className="pt-xl border-t border-border-visible flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
          <div className="flex items-center gap-sm font-mono text-label uppercase tracking-[0.08em]">
            <span className="text-text-disabled">{t("no_key_label")}</span>
            <Link
              href="/pricing"
              className="inline-flex items-center min-h-[44px] text-text-display hover:opacity-80 transition-opacity"
            >
              {t("get_key_link")} →
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
        </div>
      </div>
    </main>
  );
}
