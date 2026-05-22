import { Suspense } from "react";
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

  // Suspense is required because AdminGrantClient calls useSearchParams,
  // which forces a CSR bailout during static prerendering.
  return (
    <Suspense>
      <AdminGrantClient locale={locale} />
    </Suspense>
  );
}
