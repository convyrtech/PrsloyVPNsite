import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminUsersClient } from "@/components/admin/AdminUsersClient";
import { isAdminConfigured } from "@/lib/admin-auth";

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
  if (!isAdminConfigured()) notFound();

  return <AdminUsersClient locale={locale} />;
}
