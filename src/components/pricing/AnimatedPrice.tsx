"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * The hero price digits with two Nothing-flavoured motions:
 *
 *  1. DECODE on value change — when the period switches (450 → 360), the digits
 *     riffle through random numerals and lock left-to-right, like a terminal
 *     settling. Echoes the hero particle scramble. SSR renders the real value,
 *     so it is hydration-safe; the riffle only fires on subsequent changes.
 *  2. AMBIENT breath — a slow, low-amplitude glow so the readout feels alive
 *     without the cheapness of a blinking pulse.
 *
 * Both honour prefers-reduced-motion: the value is shown statically, no motion.
 *
 * Digit count is constant across periods within a locale (RU 450/360/270,
 * EN 5/4/3), so the riffle never shifts layout. `tabular-nums` on the consumer
 * keeps each frame the same width regardless.
 */
export function AnimatedPrice({
  value,
  prefix = "",
  className,
  style,
}: {
  value: number;
  /** Static glyph rendered before the digits (e.g. "$"), never scrambled. */
  prefix?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const reduce = useReducedMotion();
  const target = String(value);
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);

  useEffect(() => {
    if (reduce || target === prev.current) {
      setDisplay(target);
      prev.current = target;
      return;
    }

    const len = target.length;
    const framesPerDigit = 3;
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      const locked = Math.floor(frame / framesPerDigit);
      let out = "";
      for (let i = 0; i < len; i += 1) {
        out += i < locked ? target[i] : String(Math.floor(Math.random() * 10));
      }
      setDisplay(out);
      if (locked >= len) {
        setDisplay(target);
        window.clearInterval(id);
      }
    }, 45);

    prev.current = target;
    return () => window.clearInterval(id);
  }, [target, reduce]);

  return (
    <motion.span
      className={className}
      style={style}
      aria-label={`${prefix}${target}`}
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
      {prefix}{display}
    </motion.span>
  );
}
