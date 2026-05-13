import { getTranslations } from "next-intl/server";

export type LegalKind = "privacy" | "terms";

export async function LegalLayout({ kind, locale }: { kind: LegalKind; locale: string }) {
  const t = await getTranslations({ locale, namespace: `legal.${kind}` });
  const sections = (t.raw("sections") as Array<{ h: string; p: string }>) ?? [];

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <article className="max-w-2xl mx-auto px-lg flex flex-col gap-2xl">
        {/* ─── LABEL + UPDATED DATE ─── */}
        <header className="flex flex-col gap-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-md">
              <span className="inline-block w-[28px] h-px bg-border-visible" />
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
                {t("label")}
              </span>
            </div>
            <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
              {t("updated")}
            </span>
          </div>
          <h1
            className="font-body font-bold text-text-display leading-[1.05] tracking-[-0.02em] break-words"
            style={{ fontSize: "clamp(28px, 5vw, 48px)" }}
          >
            {t("title")}
          </h1>
          <p className="font-body text-body text-text-secondary leading-[1.55] max-w-xl">
            {t("intro")}
          </p>
        </header>

        <div className="h-px bg-border-visible/40" />

        {/* ─── SECTIONS ─── */}
        <div className="flex flex-col gap-2xl">
          {sections.map((section, i) => (
            <section key={i} className="flex flex-col gap-md">
              <h2 className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                {String(i + 1).padStart(2, "0")} · {section.h}
              </h2>
              <p className="font-body text-body text-text-secondary leading-[1.65]">
                {section.p}
              </p>
            </section>
          ))}
        </div>

        {/* ─── CONTACT FOOTER ─── */}
        <div className="pt-xl border-t border-border-visible flex flex-col sm:flex-row sm:items-center sm:justify-between gap-md">
          <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
            {t("contact_label")}
          </span>
          <a
            href="https://t.me/prsloy_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-label uppercase tracking-[0.08em] text-text-display
                       hover:opacity-80 transition-opacity"
          >
            {t("contact_link")} →
          </a>
        </div>
      </article>
    </main>
  );
}
