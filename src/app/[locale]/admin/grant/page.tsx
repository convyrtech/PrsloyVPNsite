import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdminGrantClient } from "@/components/admin/AdminGrantClient";

export const metadata: Metadata = {
  title: "PRSLOY Admin",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminGrantPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminGrantClient locale={locale} />;
}
