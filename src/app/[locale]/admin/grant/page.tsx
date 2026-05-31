import { Suspense } from "react";
import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminGrantClient } from "@/components/admin/AdminGrantClient";
import { isAdminConfigured } from "@/lib/admin-auth";

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
  // Without ADMIN_SECRET the surface does not exist — don't even render the
  // secret-entry form (mirrors the admin API returning 404 when unconfigured).
  if (!isAdminConfigured()) notFound();

  // Suspense is required because AdminGrantClient calls useSearchParams,
  // which forces a CSR bailout during static prerendering.
  return (
    <Suspense>
      <AdminGrantClient locale={locale} />
    </Suspense>
  );
}
