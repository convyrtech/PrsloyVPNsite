"use client";

import { useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { PaymentPills } from "@/components/pricing/PaymentPills";
import { FeatureCell } from "@/components/pricing/FeatureCell";
import {
  type Period,
  type Payment,
  PRICE_BY_PERIOD,
  formatConversion,
} from "@/lib/pricing";

/**
 * PricingStage — third cinematic act after NOTHING erosion.
 *
 * Tight emergence (220vh sticky) — content starts assembling instantly,
 * no dark preamble (we just exited the NOTHING void, no need for more).
 *
 *   0.00–0.10  IGNITION   (bright pixel + dust converge)
 *   0.10–0.25  PRICE      ($5 + /MONTH form)
 *   0.20–0.45  PERIPHERY  (label + period switcher + crypto pills)
 *   0.40–0.65  FEATURES   (3-col grid materialises)
 *   0.60–0.80  CTA        (button + guarantee)
 *   0.80–1.00  HOLD       (fully interactive)
 */
export function PricingStage() {
  const t = useTranslations("pricing");
  const stageRef = useRef<HTMLElement | null>(null);

  const { scrollYProgress: rawProgress } = useScroll({
    target: stageRef,
    offset: ["start start", "end end"],
  });
  const scrollYProgress = useSpring(rawProgress, {
    stiffness: 90,
    damping: 28,
    mass: 0.4,
    restDelta: 0.0005,
  });

  const [period, setPeriod] = useState<Period>("1mo");
  const [payMethod, setPayMethod] = useState<Payment>("SBP");

  const basePrice = PRICE_BY_PERIOD[period];
  const conversionText = formatConversion(period, payMethod);

  // ── Phase envelopes ───────────────────────────
  // Ignition pixel — fires at the very first frame, no dark preamble
  const ignitionScale = useTransform(scrollYProgress, [0, 0.10], [0, 18], { clamp: true });
  const ignitionOpacity = useTransform(
    scrollYProgress,
    [0, 0.05, 0.09, 0.13],
    [0, 1, 1, 0],
    { clamp: true }
  );

  // Dust particles converging
  const dustOpacity = useTransform(
    scrollYProgress,
    [0, 0.08, 0.20],
    [0, 0.7, 0],
    { clamp: true }
  );

  // Price ($5 + /MONTH)
  const priceOpacity = useTransform(scrollYProgress, [0.08, 0.18], [0, 1], { clamp: true });
  const priceY = useTransform(scrollYProgress, [0.08, 0.18], [40, 0], { clamp: true });
  const priceScale = useTransform(scrollYProgress, [0.08, 0.18], [0.6, 1], { clamp: true });
  const monthOpacity = useTransform(scrollYProgress, [0.16, 0.25], [0, 1], { clamp: true });

  // Top label
  const labelOpacity = useTransform(scrollYProgress, [0.22, 0.34], [0, 1], { clamp: true });
  const labelY = useTransform(scrollYProgress, [0.22, 0.34], [-12, 0], { clamp: true });

  // Period segmented control
  const periodOpacity = useTransform(scrollYProgress, [0.24, 0.36], [0, 1], { clamp: true });
  const periodY = useTransform(scrollYProgress, [0.24, 0.36], [-20, 0], { clamp: true });

  // Crypto pills
  const cryptoOpacity = useTransform(scrollYProgress, [0.30, 0.44], [0, 1], { clamp: true });
  const cryptoY = useTransform(scrollYProgress, [0.30, 0.44], [24, 0], { clamp: true });

  // Conversion line
  const convOpacity = useTransform(scrollYProgress, [0.36, 0.48], [0, 1], { clamp: true });

  // Features grid
  const includesOpacity = useTransform(scrollYProgress, [0.40, 0.52], [0, 1], { clamp: true });
  const featuresOpacity = useTransform(scrollYProgress, [0.44, 0.64], [0, 1], { clamp: true });
  const featuresY = useTransform(scrollYProgress, [0.44, 0.64], [16, 0], { clamp: true });

  // CTA + guarantee
  const ctaOpacity = useTransform(scrollYProgress, [0.60, 0.80], [0, 1], { clamp: true });
  const ctaY = useTransform(scrollYProgress, [0.60, 0.80], [32, 0], { clamp: true });
  const guaranteeOpacity = useTransform(scrollYProgress, [0.72, 0.90], [0, 1], { clamp: true });

  return (
    <section
      ref={stageRef}
      className="w-full bg-black"
      // Compressed from 350vh — content starts assembling immediately,
      // no need for a long preamble after the NOTHING void.
      style={{ height: "220vh", position: "relative" }}
    >
      <div className="sticky top-0 left-0 right-0 h-screen overflow-hidden bg-black flex items-center justify-center">
        <div className="relative w-full max-w-3xl px-lg flex flex-col items-center text-center">
          {/* ── IGNITION PIXEL — single bright dot that explodes into $ ── */}
          <motion.div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                       w-[2px] h-[2px] bg-text-display rounded-sm pointer-events-none
                       shadow-[0_0_24px_rgba(255,255,255,0.9)]"
            style={{ scale: ignitionScale, opacity: ignitionOpacity }}
            aria-hidden="true"
          />

          {/* ── DUST particles converging into the price ── */}
          <DustField opacity={dustOpacity} />

          {/* ── TOP LABEL ── */}
          <motion.p
            className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled mb-2xl"
            style={{ opacity: labelOpacity, y: labelY }}
          >
            {t("label")}
          </motion.p>

          {/* ── PERIOD SEGMENTED CONTROL ── */}
          <motion.div
            className="mb-2xl pointer-events-auto"
            style={{ opacity: periodOpacity, y: periodY }}
          >
            <PeriodControl value={period} onChange={setPeriod} />
          </motion.div>

          {/* ── PRICE — clean & confident ── */}
          <motion.div
            className="flex flex-col items-center mb-md"
            style={{ opacity: priceOpacity, y: priceY, scale: priceScale }}
          >
            {/* Tiny instrument label — only typographic "character" we keep.
                Massive uniform weight does the rest. */}
            <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-text-disabled
                            whitespace-nowrap mb-md">
              ─── PRICE ───
            </div>

            {/* $ + number — same family, same weight, same size, no italics */}
            <div
              className="font-body font-bold text-text-display leading-[0.85] tabular-nums
                         flex items-baseline"
              style={{ fontSize: "clamp(120px, 22vw, 260px)", letterSpacing: "-0.05em" }}
            >
              <span>$</span>
              <span>{basePrice}</span>
            </div>

            <motion.p
              className="font-mono text-label uppercase tracking-[0.12em] text-text-secondary mt-md"
              style={{ opacity: monthOpacity }}
            >
              {t("per_month")}
            </motion.p>

            {/* Promo line — single red accent on the entire screen */}
            <motion.div
              className="mt-md flex items-center gap-sm"
              style={{ opacity: monthOpacity }}
            >
              <span className="inline-block w-[6px] h-[6px] rounded-full bg-accent animate-pulse" />
              <span className="font-mono text-label uppercase tracking-[0.12em] text-accent">
                LAUNCH PRICE · REGULAR <span className="line-through opacity-70">$7</span>
              </span>
            </motion.div>
          </motion.div>

          {/* ── PAYMENT METHODS — fiat + crypto ── */}
          <motion.div
            className="flex flex-col items-center gap-md mb-2xl pointer-events-auto"
            style={{ opacity: cryptoOpacity, y: cryptoY }}
          >
            <PaymentPills value={payMethod} onChange={setPayMethod} />
            <motion.div
              className="font-mono text-body-sm text-text-primary tracking-[0.04em]"
              style={{ opacity: convOpacity }}
            >
              {conversionText}
            </motion.div>
          </motion.div>

          {/* ── INCLUDES divider ── */}
          <motion.div
            className="w-full flex items-center gap-md mb-lg"
            style={{ opacity: includesOpacity }}
          >
            <div className="h-px flex-1 bg-border-visible/40" />
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              {t("includes")}
            </span>
            <div className="h-px flex-1 bg-border-visible/40" />
          </motion.div>

          {/* ── FEATURE GRID ── */}
          <motion.div
            className="grid grid-cols-3 gap-x-2xl gap-y-lg mb-2xl text-left"
            style={{ opacity: featuresOpacity, y: featuresY }}
          >
            <FeatureCell label={t("feature_encryption")} value={t("feature_encryption_value")} />
            <FeatureCell label={t("feature_devices")} value={t("feature_devices_value")} />
            <FeatureCell label={t("feature_speed")} value={t("feature_speed_value")} />
            <FeatureCell label={t("feature_servers")} value={t("feature_servers_value")} />
            <FeatureCell label={t("feature_logs")} value={t("feature_logs_value")} />
            <FeatureCell label={t("feature_support")} value={t("feature_support_value")} />
          </motion.div>

          {/* ── CTA — dominant, breathing pill ── */}
          <motion.div
            className="flex flex-col items-center pointer-events-auto"
            style={{ opacity: ctaOpacity, y: ctaY }}
          >
            <motion.div
              animate={{
                scale: [1, 1.025, 1],
                boxShadow: [
                  "0 0 0 0 rgba(255,255,255,0)",
                  "0 0 24px 4px rgba(255,255,255,0.18)",
                  "0 0 0 0 rgba(255,255,255,0)",
                ],
              }}
              transition={{
                duration: 2.6,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="rounded-full"
            >
              <Link
                href="/pricing"
                className="block bg-text-display text-black font-mono uppercase tracking-[0.08em]
                           px-[56px] py-[20px] rounded-full
                           hover:opacity-95 active:scale-[0.98]
                           transition-all duration-150 ease-out-nothing"
                style={{ fontSize: "16px" }}
              >
                [ {t("cta")} ]
              </Link>
            </motion.div>
            <p className="mt-md font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
              {t("cta_meta")}
            </p>
          </motion.div>

          {/* ── GUARANTEE strip ── */}
          <motion.p
            className="mt-2xl font-mono text-label uppercase tracking-[0.08em] text-text-secondary"
            style={{ opacity: guaranteeOpacity }}
          >
            {t("guarantee")}
          </motion.p>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
   Period segmented control
   ───────────────────────────────────────────── */
function PeriodControl({
  value,
  onChange,
}: {
  value: Period;
  onChange: (v: Period) => void;
}) {
  const t = useTranslations("pricing");
  const items: { id: typeof value; label: string }[] = [
    { id: "1mo", label: t("period_1m") },
    { id: "6mo", label: t("period_6m") },
    { id: "1yr", label: t("period_12m") },
  ];
  return (
    <div className="inline-flex border border-border-visible rounded-full p-[3px] relative">
      {items.map((item) => {
        const active = value === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`
              relative px-lg py-2 font-mono text-label uppercase tracking-[0.08em]
              rounded-full transition-colors duration-200 ease-out-nothing
              ${active ? "text-black" : "text-text-secondary hover:text-text-primary"}
            `}
          >
            {active && (
              <motion.span
                layoutId="period-active-pill"
                className="absolute inset-0 bg-text-display rounded-full"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className="relative z-10">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Dust field — particles converging toward center
   during the ignition phase
   ───────────────────────────────────────────── */
function DustField({ opacity }: { opacity: MotionValue<number> }) {
  // Pre-compute particle positions deterministically
  const particles = (() => {
    const out: { angle: number; dist: number; size: number; delay: number }[] = [];
    let seed = 0xc0de;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 60; i++) {
      out.push({
        angle: rng() * Math.PI * 2,
        dist: 80 + rng() * 240,
        size: rng() < 0.7 ? 1 : 2,
        delay: rng() * 0.6,
      });
    }
    return out;
  })();

  return (
    <motion.svg
      className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none overflow-visible"
      style={{ opacity, width: "1px", height: "1px" }}
      aria-hidden="true"
    >
      {particles.map((p, i) => {
        const x = Math.cos(p.angle) * p.dist;
        const y = Math.sin(p.angle) * p.dist;
        return (
          <rect
            key={i}
            x={x - p.size / 2}
            y={y - p.size / 2}
            width={p.size}
            height={p.size}
            fill="#ffffff"
            opacity={0.7}
          />
        );
      })}
    </motion.svg>
  );
}
