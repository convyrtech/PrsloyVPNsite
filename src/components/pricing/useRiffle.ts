"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Returns a display string for a number that "riffle-decodes" — digits flicker
 * through random numerals and lock left-to-right — whenever the value changes.
 * Echoes the hero particle scramble.
 *
 * `onMount: true` also decodes on first render (use for values that appear
 * after a fetch, e.g. the capacity counter — no SSR value, so no flash). The
 * default decodes on change only, which is hydration-safe for SSR'd values.
 *
 * Honours prefers-reduced-motion: the value is returned as-is, no animation.
 */
export function useRiffle(
  value: number,
  { onMount = false }: { onMount?: boolean } = {}
): string {
  const reduce = useReducedMotion();
  const target = String(value);
  const [display, setDisplay] = useState(target);
  const prev = useRef<string | null>(onMount ? null : target);

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

  return display;
}
