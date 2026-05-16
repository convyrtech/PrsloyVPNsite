import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/routing";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { DotoNumber } from "@/components/ui/DotoNumber";
import { TELEGRAM_BOT_URL } from "@/lib/links";

type SetupItem = { title: string; body: string };

export default async function SetupPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "setup_page" });

  const checklist = (t.raw("checklist") as SetupItem[]) ?? [];
  const steps = (t.raw("steps") as SetupItem[]) ?? [];

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-5xl mx-auto px-lg flex flex-col gap-3xl">
        <RevealOnView y={12}>
          <SectionLabel>{t("label")}</SectionLabel>
        </RevealOnView>

        <RevealOnView delay={0.05}>
          <header className="grid gap-xl lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="flex flex-col gap-lg max-w-3xl">
              <h1
                className="font-body font-bold text-text-display leading-[0.95] tracking-[-0.03em] break-words"
                style={{ fontSize: "clamp(40px, 7vw, 84px)" }}
              >
                {t("title")}
              </h1>
              <p className="font-body text-body text-text-secondary leading-[1.6] max-w-2xl">
                {t("subtitle")}
              </p>
            </div>
            <DotoNumber
              value={String(steps.length).padStart(2, "0")}
              unit={t("steps_unit")}
              pulse
              pulseColor="bg-success"
            />
          </header>
        </RevealOnView>

        <RevealOnView delay={0.1}>
          <section className="grid grid-cols-1 md:grid-cols-3 gap-md">
            {checklist.map((item, i) => (
              <article
                key={item.title}
                className="border border-border-visible rounded-[8px] p-lg min-h-[180px] flex flex-col gap-md"
              >
                <span className="font-mono text-label uppercase tracking-[0.14em] text-text-disabled">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 className="font-body font-bold text-text-display text-subheading leading-[1.2]">
                  {item.title}
                </h2>
                <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
                  {item.body}
                </p>
              </article>
            ))}
          </section>
        </RevealOnView>

        <RevealOnView>
          <section className="grid gap-lg lg:grid-cols-[180px_1fr] pt-xl border-t border-border-visible">
            <span className="font-mono text-label uppercase tracking-[0.14em] text-text-disabled">
              {t("security_label")}
            </span>
            <div className="grid gap-lg lg:grid-cols-[1fr_auto] lg:items-start">
              <div className="flex flex-col gap-md">
                <h2 className="font-body font-bold text-text-display text-heading leading-[1.15]">
                  {t("security_title")}
                </h2>
                <p className="font-body text-body text-text-secondary leading-[1.65] max-w-2xl">
                  {t("security_body")}
                </p>
              </div>
              <Link
                href="/dashboard"
                className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-lg
                           font-mono text-label uppercase tracking-[0.08em] text-text-display
                           hover:border-text-display transition-colors"
              >
                [ {t("dashboard_link")} ]
              </Link>
            </div>
          </section>
        </RevealOnView>

        <section className="flex flex-col">
          {steps.map((step, i) => (
            <RevealOnView key={step.title} delay={0.04 * i}>
              <article
                className={`grid gap-lg py-2xl border-border-visible/50
                            ${i === 0 ? "border-y" : "border-b"}
                            lg:grid-cols-[180px_1fr]`}
              >
                <div className="flex items-start gap-md">
                  <span className="font-mono text-label uppercase tracking-[0.14em] text-text-disabled">
                    {t("step_label_prefix")}
                  </span>
                  <span className="font-mono text-label uppercase tracking-[0.14em] text-text-display tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                </div>
                <div className="flex flex-col gap-md">
                  <h2 className="font-body font-bold text-text-display text-heading leading-[1.15]">
                    {step.title}
                  </h2>
                  <p className="font-body text-body text-text-secondary leading-[1.65] max-w-3xl">
                    {step.body}
                  </p>
                </div>
              </article>
            </RevealOnView>
          ))}
        </section>

        <RevealOnView>
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-md">
            <article className="border border-border-visible rounded-[8px] p-xl sm:p-2xl bg-surface flex flex-col gap-lg">
              <div className="flex items-center gap-sm">
                <span className="inline-block h-[6px] w-[6px] rounded-full bg-warning animate-pulse" />
                <h3 className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                  {t("troubleshooting_label")}
                </h3>
              </div>
              <p className="font-body text-body text-text-secondary leading-[1.65]">
                {t("troubleshooting_body")}
              </p>
              <a
                href={TELEGRAM_BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="self-start font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80"
              >
                {t("telegram_link")} -&gt;
              </a>
            </article>

            <article className="border border-border-visible rounded-[8px] p-xl sm:p-2xl flex flex-col gap-lg">
              <h3 className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                {t("no_key_label")}
              </h3>
              <p className="font-body text-body text-text-secondary leading-[1.65]">
                {t("no_key_body")}
              </p>
              <Link
                href="/pricing"
                className="self-start font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80"
              >
                {t("get_key_link")} -&gt;
              </Link>
            </article>
          </section>
        </RevealOnView>
      </div>
    </main>
  );
}
