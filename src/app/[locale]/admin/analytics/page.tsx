import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminAnalyticsClient } from "@/components/admin/AdminAnalyticsClient";
import { isAdminConfigured } from "@/lib/admin-auth";

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
  if (!isAdminConfigured()) notFound();
  return <AdminAnalyticsClient locale={locale} />;
}
