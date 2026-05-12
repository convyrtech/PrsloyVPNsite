"use client";

import { motion, type MotionValue, useTransform } from "motion/react";
import { Fragment } from "react";

type Props = {
  text: string;
  /** Scroll-driven motion value 0→1 controlling reveal */
  progress: MotionValue<number>;
  /** "in" reveals chars left→right; "out" hides them right→left */
  direction?: "in" | "out";
  /** Fraction of progress over which the cascade unfolds (rest is buffer) */
  spread?: number;
  /** Translate distance in px during transition */
  translate?: number;
  className?: string;
};

/**
 * Awwwards-tier per-char text reveal.
 *
 * progress=0 → all chars hidden (translateY=translate, opacity=0)
 * progress=1 → all chars revealed (translateY=0, opacity=1)
 *
 * Each char's individual envelope is offset by index/charCount * (1 - spread).
 * Words are kept on same line via inline-block whitespace handling.
 */
export function RevealText({
  text,
  progress,
  direction = "in",
  spread = 0.65,
  translate = 24,
  className,
}: Props) {
  const words = text.split(" ");
  const totalChars = text.length;

  let charIndex = 0;
  const lead = direction === "in" ? 0 : 1;
  const tail = direction === "in" ? 1 : 0;

  return (
    <span className={`inline-flex flex-wrap ${className ?? ""}`}>
      {words.map((word, wi) => {
        const wordSpans = word.split("").map((ch) => {
          const start = (charIndex / Math.max(1, totalChars - 1)) * (1 - spread);
          const end = start + spread;
          charIndex++;
          return { ch, start, end };
        });

        return (
          <Fragment key={wi}>
            <span className="inline-flex whitespace-nowrap">
              {wordSpans.map(({ ch, start, end }, ci) => (
                <Char
                  key={ci}
                  char={ch}
                  start={start}
                  end={end}
                  progress={progress}
                  lead={lead}
                  tail={tail}
                  translate={translate}
                />
              ))}
            </span>
            {wi < words.length - 1 && (
              <span className="inline-block" aria-hidden="true">
                &nbsp;
              </span>
            )}
          </Fragment>
        );
      })}
    </span>
  );
}

function Char({
  char,
  start,
  end,
  progress,
  lead,
  tail,
  translate,
}: {
  char: string;
  start: number;
  end: number;
  progress: MotionValue<number>;
  lead: number;
  tail: number;
  translate: number;
}) {
  const opacity = useTransform(progress, [start, end], [lead, tail]);
  const y = useTransform(progress, [start, end], [
    lead === 0 ? translate : 0,
    tail === 0 ? translate : 0,
  ]);
  return (
    <motion.span
      className="inline-block"
      style={{ opacity, y, willChange: "opacity, transform" }}
    >
      {char}
    </motion.span>
  );
}
