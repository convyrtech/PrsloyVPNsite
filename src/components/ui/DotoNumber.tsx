"use client";

import { motion } from "motion/react";

/**
 * Display-grade number/letter rendered in Doto — the "moment of surprise"
 * each Nothing-style page gets exactly one of. Use sparingly.
 *
 * Pulse dot is optional (matches the landing's status notch / promo strip
 * pattern). Scale-in motion mirrors the cinematic acts.
 */
export function DotoNumber({
  value,
  unit,
  pulse,
  pulseColor = "bg-success",
  className = "",
}: {
  value: string | number;
  unit?: string;
  pulse?: boolean;
  pulseColor?: string;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
      className={`flex items-baseline gap-md ${className}`}
    >
      {pulse && (
        <span className="self-center inline-flex relative w-[10px] h-[10px] rounded-full">
          <span className={`absolute inset-0 rounded-full ${pulseColor} animate-pulse`} />
        </span>
      )}
      <span
        className="font-display font-bold text-text-display leading-[0.85] tabular-nums"
        style={{ fontSize: "clamp(64px, 12vw, 144px)", letterSpacing: "0.02em" }}
      >
        {value}
      </span>
      {unit && (
        <span
          className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled
                     self-end pb-2"
        >
          {unit}
        </span>
      )}
    </motion.div>
  );
}
