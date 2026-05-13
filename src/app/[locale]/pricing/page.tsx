import { setRequestLocale } from "next-intl/server";
import { PricingPageClient } from "./PricingPageClient";

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <PricingPageClient locale={locale} />;
}
