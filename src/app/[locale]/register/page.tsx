import { getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Link } from "@/i18n/routing";
import { AuthForm } from "@/components/auth/AuthForm";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { getCurrentUser, isAuthSetupError } from "@/lib/auth";

export default async function RegisterPage({
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
              <SectionLabel>{t("register_label")}</SectionLabel>
            </RevealOnView>

            <RevealOnView delay={0.05}>
              <h1
                className="font-body font-bold text-text-display leading-[0.95] tracking-[-0.03em] break-words"
                style={{ fontSize: "clamp(40px, 8vw, 72px)" }}
              >
                {t("register_title")}
              </h1>
            </RevealOnView>

            <RevealOnView delay={0.08}>
              <p className="font-body text-body text-text-secondary leading-[1.55] max-w-md">
                {t("register_subtitle")}
              </p>
            </RevealOnView>

            <RevealOnView delay={0.12}>
              <div className="mt-sm pt-md border-t border-border-visible flex items-center gap-sm
                              font-mono text-label uppercase tracking-[0.08em]">
                <span className="text-text-disabled">{t("has_account")}</span>
                <Link href="/login" className="text-text-display hover:opacity-80">
                  {t("login_link")}
                </Link>
              </div>
            </RevealOnView>
          </div>

          {/* FORM SIDE */}
          <RevealOnView delay={0.1}>
            <section className="border border-border-visible rounded-[24px] p-xl sm:p-2xl">
              <AuthForm
                mode="register"
                locale={locale}
                copy={{
                  email: t("email"),
                  password: t("password"),
                  emailPlaceholder: t("email_placeholder"),
                  passwordPlaceholder: t("password_placeholder"),
                  submit: t("register_submit"),
                  submitting: t("submitting"),
                  invalid: t("invalid"),
                  emailExists: t("email_exists"),
                  credentials: t("credentials"),
                  notConfigured: t("not_configured"),
                  storageNotConfigured: t("storage_not_configured"),
                  secretNotConfigured: t("secret_not_configured"),
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
