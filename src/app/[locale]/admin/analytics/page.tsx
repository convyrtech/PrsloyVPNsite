import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdminAnalyticsClient } from "@/components/admin/AdminAnalyticsClient";

export const metadata: Metadata = {
  title: "PRSLOY Admin · Analytics",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminAnalyticsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <AdminAnalyticsClient locale={locale} />;
}
