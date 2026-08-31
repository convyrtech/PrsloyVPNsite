"use client";

import { motion, useReducedMotion } from "motion/react";
import { useRiffle } from "@/components/pricing/useRiffle";

/**
 * The hero price digits with two Nothing-flavoured motions:
 *
 *  1. DECODE on value change — when the period switches (450 → 360), the digits
 *     riffle through random numerals and lock left-to-right (see useRiffle).
 *     SSR renders the real value, so it is hydration-safe.
 *  2. AMBIENT breath — a slow, low-amplitude glow so the readout feels alive
 *     without the cheapness of a blinking pulse.
 *
 * Both honour prefers-reduced-motion. Digit count is constant across periods
 * (199/159/119 — three digits each), so the riffle never shifts layout;
 * `tabular-nums` on the consumer keeps each frame the same width.
 */
export function AnimatedPrice({
  value,
  className,
  style,
}: {
  value: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  const display = useRiffle(value);

  return (
    <motion.span
      className={className}
      style={style}
      aria-label={String(value)}
      animate={
        reduce
          ? undefined
          : {
              textShadow: [
                "0 0 0px rgba(255,255,255,0)",
                "0 0 26px rgba(255,255,255,0.22)",
                "0 0 0px rgba(255,255,255,0)",
              ],
            }
      }
      transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
    >
      {display}
    </motion.span>
  );
}
