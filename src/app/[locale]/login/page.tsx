import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/routing";
import { AuthForm } from "@/components/auth/AuthForm";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { getCurrentUser, isAuthSetupError } from "@/lib/auth";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "auth" });

  try {
    const user = await getCurrentUser();
    if (user) redirect(`/${locale}/dashboard`);
  } catch (err) {
    if (!isAuthSetupError(err)) throw err;
  }

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl flex flex-col">
      <div className="flex-1 w-full max-w-5xl mx-auto px-lg flex items-start lg:items-center">
        <div className="w-full grid gap-2xl lg:grid-cols-2 lg:gap-4xl lg:items-center">
          {/* TEXT SIDE */}
          <div className="flex flex-col gap-lg">
            <RevealOnView y={12}>
              <SectionLabel>{t("login_label")}</SectionLabel>
            </RevealOnView>

            <RevealOnView delay={0.05}>
              <h1
                className="font-body font-bold text-text-display leading-[0.95] tracking-[-0.03em] break-words"
                style={{ fontSize: "clamp(40px, 8vw, 72px)" }}
              >
                {t("login_title")}
              </h1>
            </RevealOnView>

            <RevealOnView delay={0.08}>
              <p className="font-body text-body text-text-secondary leading-[1.55] max-w-md">
                {t("login_subtitle")}
              </p>
            </RevealOnView>

            <RevealOnView delay={0.12}>
              <div className="mt-sm pt-md border-t border-border-visible flex items-center gap-sm
                              font-mono text-label uppercase tracking-[0.08em]">
                <span className="text-text-disabled">{t("no_account")}</span>
                <Link href="/register" className="text-text-display hover:opacity-80">
                  {t("register_link")}
                </Link>
              </div>
            </RevealOnView>
          </div>

          {/* FORM SIDE */}
          <RevealOnView delay={0.1}>
            <section className="border border-border-visible rounded-[8px] p-xl sm:p-2xl bg-surface">
              <div className="mb-xl border-b border-border-visible pb-lg flex flex-col gap-md">
                <div className="flex items-center justify-between gap-md font-mono text-label uppercase tracking-[0.14em]">
                  <span className="text-text-disabled">PRSLOY ID</span>
                  <span className="text-text-display">AUTH</span>
                </div>
                <div className="grid grid-cols-3 gap-sm">
                  {["EMAIL", "SESSION", "ACCESS"].map((item, index) => (
                    <div key={item} className="border border-border-visible bg-black p-sm">
                      <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-disabled">
                        {String(index + 1).padStart(2, "0")}
                      </div>
                      <div className="mt-xs font-mono text-label uppercase tracking-[0.08em] text-text-display">
                        {item}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <AuthForm
                mode="login"
                locale={locale}
                copy={{
                  email: t("email"),
                  password: t("password"),
                  emailPlaceholder: t("email_placeholder"),
                  passwordPlaceholder: t("password_placeholder"),
                  submit: t("login_submit"),
                  submitting: t("submitting"),
                  invalid: t("invalid"),
                  emailExists: t("email_exists"),
                  credentials: t("credentials"),
                  notConfigured: t("not_configured"),
                  storageNotConfigured: t("storage_not_configured"),
                  secretNotConfigured: t("secret_not_configured"),
                  rateLimited: t("rate_limited"),
                  generic: t("generic_error"),
                }}
              />
            </section>
          </RevealOnView>
        </div>
      </div>
    </main>
  );
}
