import { setRequestLocale } from "next-intl/server";
import { LegalLayout } from "@/components/sections/LegalLayout";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <LegalLayout kind="privacy" locale={locale} />;
}
