import { setRequestLocale } from "next-intl/server";

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <p className="font-mono text-label uppercase text-text-disabled">
        [ PRIVACY · COMING SOON ]
      </p>
    </main>
  );
}
