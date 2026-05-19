"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { RevealText } from "@/components/animations/RevealText";

/**
 * UI overlay that appears AFTER the globe materializes.
 * Driven by externalProgress (0 → 1 over scroll range 0.78 → 0.95).
 */
export function GlobeUIOverlay({
  progress,
  isTouch,
}: {
  progress: MotionValue<number>;
  isTouch: boolean;
}) {
  const t = useTranslations("globe");

  const labelOp = useTransform(progress, [0, 0.3], [0, 1]);
  const titleProgress = useTransform(progress, [0.1, 0.6], [0, 1]);
  const subOp = useTransform(progress, [0.4, 0.7], [0, 1]);
  const metricsOp = useTransform(progress, [0.5, 0.85], [0, 1]);
  const ctaOp = useTransform(progress, [0.6, 1], [0, 1]);
  const ctaY = useTransform(progress, [0.6, 1], [24, 0]);
  const hintOp = useTransform(progress, [0.7, 1], [0, 0.6]);

  return (
    <>
      {/* TOP-LEFT — label + title + subtitle */}
      <div className="absolute top-[clamp(112px,16vh,156px)] left-lg md:top-[clamp(132px,17vh,188px)] md:left-2xl">
        <motion.p
          className="font-mono text-label uppercase text-text-disabled tracking-[0.08em] mb-md"
          style={{ opacity: labelOp }}
        >
          {t("label")}
        </motion.p>
        <h2 className="font-body font-light text-text-display text-[clamp(28px,4vw,52px)]
                       leading-[1.05] tracking-[-0.02em] max-w-[14ch] block">
          <RevealText text={t("title_line1")} progress={titleProgress} />
          <br />
          <span className="font-medium">
            <RevealText text={t("title_line2_strong")} progress={titleProgress} />
          </span>
        </h2>
        <motion.p
          className="font-body text-body-sm text-text-secondary mt-md max-w-xs leading-relaxed"
          style={{ opacity: subOp }}
        >
          {t("subtitle")}
        </motion.p>
      </div>

      {/* TOP-RIGHT — honest metrics */}
      <motion.div
        className="absolute top-[clamp(96px,14vh,144px)] right-lg md:top-[clamp(112px,14vh,160px)] md:right-2xl
                   grid grid-cols-3 gap-lg text-right"
        style={{ opacity: metricsOp }}
      >
        <Metric label={t("metric_routing")} value={t("metric_routing_value")} />
        <Metric label={t("metric_logs")} value={t("metric_logs_value")} />
        <Metric label={t("metric_status")} value={t("metric_status_value")} />
      </motion.div>

      {/* BOTTOM-RIGHT CTA */}
      <motion.div
        className="absolute bottom-2xl right-lg md:bottom-3xl md:right-2xl pointer-events-auto"
        style={{ opacity: ctaOp, y: ctaY }}
      >
        <Link
          href="/pricing"
          className="inline-block bg-text-display text-black font-mono text-body-sm
                     uppercase tracking-[0.08em] px-xl py-md rounded-full
                     hover:opacity-90 active:scale-[0.98]
                     transition-all duration-150 ease-out-nothing"
        >
          [ {t("cta")} ]
        </Link>
      </motion.div>

      {/* BOTTOM-CENTER hint */}
      <motion.span
        className="absolute bottom-md left-1/2 -translate-x-1/2
                   font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary
                   pointer-events-none whitespace-nowrap"
        style={{ opacity: hintOp }}
      >
        {isTouch ? t("hint_touch") : t("hint_desktop")}
      </motion.span>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-left">
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-text-secondary mb-1">
        {label}
      </div>
      <div className="font-mono text-body-sm text-text-display tracking-[-0.01em]">
        {value}
      </div>
    </div>
  );
}
