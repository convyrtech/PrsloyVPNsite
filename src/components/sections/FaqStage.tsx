"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

const QuestionMark3D = dynamic(
  () => import("./QuestionMark3D").then((m) => m.QuestionMark3D),
  { ssr: false, loading: () => null }
);

/** Odometer-style number cycle: 00 → 99 → settles on target */
function FaqOdometer({ target, trigger, delay }: { target: string; trigger: boolean; delay: number }) {
  const [display, setDisplay] = useState("00");
  useEffect(() => {
    if (!trigger) return;
    const startAt = window.setTimeout(() => {
      let frame = 0;
      const totalFrames = 14;
      const id = window.setInterval(() => {
        frame++;
        if (frame >= totalFrames) {
          setDisplay(target);
          window.clearInterval(id);
        } else {
          setDisplay(String(Math.floor(Math.random() * 99)).padStart(2, "0"));
        }
      }, 38);
    }, delay * 1000);
    return () => window.clearTimeout(startAt);
  }, [trigger, target, delay]);
  return <span className="tabular-nums">{display}</span>;
}

/** Word-by-word fade reveal for question text */
function FaqWordReveal({ text, trigger, delay }: { text: string; trigger: boolean; delay: number }) {
  const words = text.split(" ");
  return (
    <span>
      {words.map((w, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 12, filter: "blur(6px)" }}
          animate={trigger ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
          transition={{
            duration: 0.35,
            delay: delay + i * 0.025,
            ease: [0.25, 0.1, 0.25, 1],
          }}
          className="inline-block mr-[0.25em]"
        >
          {w}
        </motion.span>
      ))}
    </span>
  );
}

/**
 * FAQ block — "trust pad" between Pricing and Footer.
 *
 * NOT scroll-driven — fixed-height section with Intersection-Observer
 * fade-in. Three pages of cinematic intensity already happened. Here
 * the user gets to land, breathe, read.
 *
 * Layout (asymmetric, Nothing-style):
 *   - QUESTIONS label top-left
 *   - 3D dot question mark dominates the right-half (sticky-ish on screen)
 *   - 3 questions stacked left-half with diagonal flow:
 *       Q1 top-left → Q2 mid-left → Q3 bottom-left (no zigzag, just stack)
 *   - Each Q has number + question + dash-prefixed answer
 *   - "ALL 12 QUESTIONS →" link at bottom
 */
export function FaqStage() {
  const t = useTranslations("faq");
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { once: true, margin: "0px 0px 25% 0px" });
  const [shouldMount3D, setShouldMount3D] = useState(false);

  useEffect(() => {
    if (inView) setShouldMount3D(true);
  }, [inView]);

  const items = [
    { num: "01", q: t("q1"), a: t("a1") },
    { num: "02", q: t("q2"), a: t("a2") },
    { num: "03", q: t("q3"), a: t("a3") },
  ];

  return (
    <section
      ref={sectionRef}
      className="relative w-full bg-black py-3xl md:py-[140px]"
    >
      {/* QUESTIONS label — top-left, separate row */}
      <div className="px-lg md:px-2xl mb-2xl">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
          className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled"
        >
          {t("label")}
        </motion.p>
      </div>

      {/* MAIN GRID — questions left, 3D mark right */}
      <div className="px-lg md:px-2xl grid md:grid-cols-[1.1fr_0.9fr] gap-2xl items-center max-w-[1400px] mx-auto relative">
        {/* LEFT — stacked questions */}
        <div className="flex flex-col gap-2xl relative z-10">
          {items.map((item, i) => {
            const baseDelay = 0.08 + i * 0.12;
            return (
              <motion.div
                key={item.num}
                initial={{ opacity: 0 }}
                animate={inView ? { opacity: 1 } : {}}
                transition={{ duration: 0.4, delay: baseDelay }}
                className="max-w-xl"
              >
                {/* Number + animated growing divider */}
                <div className="flex items-center gap-md mb-md">
                  <motion.span
                    initial={{ opacity: 0, y: -6 }}
                    animate={inView ? { opacity: 1, y: 0 } : {}}
                    transition={{ duration: 0.4, delay: baseDelay }}
                    className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled"
                  >
                    <FaqOdometer target={item.num} trigger={inView} delay={baseDelay} />
                  </motion.span>
                  <motion.span
                    initial={{ scaleX: 0 }}
                    animate={inView ? { scaleX: 1 } : {}}
                    transition={{ duration: 0.7, delay: baseDelay + 0.05, ease: [0.25, 0.1, 0.25, 1] }}
                    style={{ transformOrigin: "left center" }}
                    className="h-px flex-1 bg-border-visible/40 block"
                  />
                </div>

                {/* Question — char-by-char reveal */}
                <h3 className="font-body font-medium text-text-display
                               text-[clamp(22px,2.6vw,32px)] leading-[1.15] tracking-[-0.01em]
                               mb-lg">
                  <FaqWordReveal text={item.q} trigger={inView} delay={baseDelay + 0.15} />
                </h3>

                {/* Answer — shimmer mask reveal */}
                <motion.p
                  initial={{ opacity: 0, y: 8 }}
                  animate={inView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.45, delay: baseDelay + 0.25 }}
                  className="font-body font-light text-text-secondary
                             text-[clamp(15px,1.4vw,18px)] leading-[1.55]
                             relative pl-lg before:absolute before:left-0 before:top-[0.7em]
                             before:w-md before:h-px before:bg-text-disabled"
                >
                  {item.a}
                </motion.p>
              </motion.div>
            );
          })}
        </div>

        {/* RIGHT — 3D dot question mark */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1.2, delay: 0.3 }}
          className="relative aspect-square w-full max-w-[520px] mx-auto md:ml-auto md:mr-0"
        >
          {shouldMount3D && <QuestionMark3D />}
        </motion.div>
      </div>

      {/* "ALL 12 QUESTIONS" link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.9 }}
        className="mt-3xl flex items-center justify-center gap-md px-lg"
      >
        <span className="h-px flex-1 max-w-[180px] bg-border-visible/40" />
        <Link
          href="/faq"
          className="font-mono text-label uppercase tracking-[0.16em]
                     text-text-secondary hover:text-text-display
                     transition-colors duration-150 ease-out-nothing"
        >
          {t("see_all")} →
        </Link>
        <span className="h-px flex-1 max-w-[180px] bg-border-visible/40" />
      </motion.div>
    </section>
  );
}
