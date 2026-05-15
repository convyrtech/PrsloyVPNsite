import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { Doto, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { routing, type Locale } from "@/i18n/routing";
import { Header } from "@/components/sections/Header";
import "@/app/globals.css";

function isValidLocale(value: string): value is Locale {
  return (routing.locales as readonly string[]).includes(value);
}

const doto = Doto({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-display",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-body",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "700"],
  variable: "--font-mono",
  display: "swap",
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Used for OG/canonical/sitemap URLs. Override via NEXT_PUBLIC_SITE_URL in env.
function getSiteUrl() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.prsloy.online";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://www.prsloy.online");
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const otherLocale = locale === "en" ? "ru" : "en";

  return {
    metadataBase: getSiteUrl(),
    title: t("title"),
    description: t("description"),
    alternates: {
      canonical: `/${locale}`,
      languages: {
        en: "/en",
        ru: "/ru",
        "x-default": "/en",
      },
    },
    openGraph: {
      title: t("ogTitle"),
      description: t("ogDescription"),
      url: `/${locale}`,
      siteName: "PRSLOY",
      locale: locale === "ru" ? "ru_RU" : "en_US",
      alternateLocale: otherLocale === "ru" ? "ru_RU" : "en_US",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: t("ogTitle"),
      description: t("ogDescription"),
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isValidLocale(locale)) {
    notFound();
  }
  setRequestLocale(locale);

  // Pass messages explicitly so client components have access via useTranslations
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${doto.variable} ${plexSans.variable} ${plexMono.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages} locale={locale}>
          <Header />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
