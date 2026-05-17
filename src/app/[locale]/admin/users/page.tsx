import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";

export const metadata: Metadata = {
  title: "PRSLOY Admin · Users",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminUsersPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return <AdminUsersClient locale={locale} />;
}
