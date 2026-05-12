import { setRequestLocale } from "next-intl/server";
import { ScrollStage } from "@/components/sections/ScrollStage";
import { NothingStage } from "@/components/sections/NothingStage";
import { PricingStage } from "@/components/sections/PricingStage";
import { FaqStage } from "@/components/sections/FaqStage";
import { Footer } from "@/components/sections/Footer";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      {/* ACT 1 — Hero → Handshake → Globe */}
      <ScrollStage />

      {/* ACT 2 — "YOUR ISP SEES NOTHING" type erosion */}
      <NothingStage />

      {/* ACT 3 — Price emerges from the void */}
      <PricingStage />

      {/* ACT 4 — Trust pad: 3 sharp questions + 3D ? */}
      <FaqStage />

      {/* ACT 5 — Departure board closing */}
      <Footer />
    </>
  );
}
