import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { unstable_rethrow } from "next/navigation";
import { PricingPageClient } from "./PricingPageClient";
import { getCurrentUser } from "@/lib/auth";
import { JsonLd } from "@/components/seo/JsonLd";
import { PERIODS, MONTHS_BY_PERIOD, getPeriodTotalRub } from "@/lib/pricing";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "pricing_page" });
  return { title: t("meta_title"), description: t("meta_description") };
}

const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.prsloy.online"
).replace(/\/+$/, "");

export default async function PricingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Session is read here, not in the client: the checkout is the money moment
  // and must render in its final shape on the first paint — no guest-form
  // flash for a signed-in buyer, no extra /api/auth/me round trip.
  let authed = false;
  let emailMissing = false;
  try {
    const user = await getCurrentUser();
    authed = Boolean(user);
    // Telegram-only accounts have no email; payment creation needs one.
    emailMissing = authed && !user?.email;
  } catch (err) {
    // Next's own control-flow signals (the dynamic-rendering bailout above
    // all) must keep propagating. Everything else — KV down, storage not
    // configured — degrades to the guest checkout: /pricing is the funnel,
    // it must not 500 for anonymous traffic over a session lookup.
    unstable_rethrow(err);
    console.warn("[pricing] session lookup failed, rendering guest checkout", err);
  }

  // Product + per-period Offers in rubles — the price block Yandex reads.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "PRSLOY VPN",
    description: (await getTranslations({ locale, namespace: "pricing_page" }))(
      "meta_description"
    ),
    brand: { "@type": "Brand", name: "PRSLOY" },
    url: `${SITE_URL}/${locale}/pricing`,
    offers: PERIODS.map((period) => ({
      "@type": "Offer",
      price: getPeriodTotalRub(period),
      priceCurrency: "RUB",
      url: `${SITE_URL}/${locale}/pricing`,
      availability: "https://schema.org/InStock",
      eligibleDuration: {
        "@type": "QuantitativeValue",
        value: MONTHS_BY_PERIOD[period],
        unitCode: "MON",
      },
    })),
  };

  return (
    <>
      <JsonLd data={productJsonLd} />
      <PricingPageClient locale={locale} authed={authed} emailMissing={emailMissing} />
    </>
  );
}
