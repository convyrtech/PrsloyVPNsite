"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  useScroll,
  useSpring,
  useTransform,
  useMotionValueEvent,
} from "motion/react";
import { useTranslations } from "next-intl";
import { TextErosion } from "./TextErosion";

const CIPHER_CHARS = "▓░█▒%@#&XΨΔΣΩ$01";

/**
 * NothingStage — second cinematic act after Globe.
 *
 *   0.00–0.18  ASSEMBLE   ("YOUR ISP SEES" + NOTHING fade in)
 *   0.18–0.40  IDLE       (whole text)
 *   0.40–0.58  CIPHER     (NOTHING mutates through Matrix chars on DOM)
 *   0.58–0.62  HANDOFF    (DOM text fades to canvas)
 *   0.62–0.95  EROSION    (text crumbles edge-first into drifting particles)
 *   0.95–1.00  VOID       (cleanup, scroll cue)
 */
export function NothingStage() {
  const t = useTranslations("nothing");
  const targetWord = t("nothing_word");
  const stageRef = useRef<HTMLElement | null>(null);
  const domTextRef = useRef<HTMLDivElement | null>(null);
  const [matchEl, setMatchEl] = useState<HTMLElement | null>(null);

  // After mount, expose the DOM text element to TextErosion so it can
  // copy its exact font/size/letter-spacing/position.
  useEffect(() => {
    setMatchEl(domTextRef.current);
  }, []);

  const { scrollYProgress: rawProgress } = useScroll({
    target: stageRef,
    offset: ["start start", "end end"],
  });
  const scrollYProgress = useSpring(rawProgress, {
    stiffness: 150,
    damping: 34,
    mass: 0.25,
    restDelta: 0.0005,
  });

  // ── Sub-text envelopes ─────────────────────
  const yourIspOpacity = useTransform(
    scrollYProgress,
    [0.00, 0.62, 0.72],
    [1, 1, 0],
    { clamp: true }
  );
  const labelOpacity = useTransform(
    scrollYProgress,
    [0.00, 0.62, 0.72],
    [1, 1, 0],
    { clamp: true }
  );
  const metaOpacity = useTransform(
    scrollYProgress,
    [0.04, 0.16, 0.62, 0.72],
    [0, 1, 1, 0],
    { clamp: true }
  );
  // Scroll cue appears EARLIER (0.85) so user sees direction before void
  const cueOpacity = useTransform(scrollYProgress, [0.85, 0.95], [0, 0.7], { clamp: true });
  const cueY = useTransform(scrollYProgress, [0.85, 0.95], [12, 0], { clamp: true });

  // (no closing statement — silence after the erosion is the punctuation.
  //  Adding text post-void would invert the message: NOTHING the user
  //  sees is the *good* outcome, not a loss. Scroll cue handles direction.)

  // ── DOM text (with cipher) — visible immediately, hands off to canvas
  const domTextOpacity = useTransform(
    scrollYProgress,
    [0.00, 0.58, 0.62],
    [1, 1, 0],
    { clamp: true }
  );

  // ── Canvas erosion — holds through the section boundary
  const canvasOpacity = useTransform(
    scrollYProgress,
    [0.58, 0.62, 1.0],
    [0, 1, 1],
    { clamp: true }
  );

  // Erosion progress driver — slowest growth at start, fast tail so the
  // last fragments crumble in the final 20% of scroll
  const erosionProgress = useTransform(
    scrollYProgress,
    [0.62, 0.95],
    [0, 1],
    { clamp: true }
  );

  // ── Cipher mode (DOM text mutation) ──
  const [cipherText, setCipherText] = useState(targetWord);
  const cipherActive = useRef(false);

  useMotionValueEvent(rawProgress, "change", (v) => {
    cipherActive.current = v >= 0.40 && v <= 0.58;
  });

  useEffect(() => {
    const id = setInterval(() => {
      if (cipherActive.current) {
        let out = "";
        for (let i = 0; i < targetWord.length; i++) {
          const lockChance = 0.18;
          out +=
            Math.random() < lockChance
              ? targetWord[i]
              : CIPHER_CHARS[Math.floor(Math.random() * CIPHER_CHARS.length)];
        }
        setCipherText(out);
      } else {
        setCipherText(targetWord);
      }
    }, 70);
    return () => clearInterval(id);
  }, [targetWord]);

  return (
    <section
      ref={stageRef}
      className="w-full bg-black"
      // Start exactly when the previous sticky viewport releases; this keeps
      // the handoff deliberate without the extra black drift between acts.
      style={{ height: "270vh", marginTop: "-100vh", position: "relative" }}
    >
      <div className="sticky top-0 left-0 right-0 h-screen overflow-hidden bg-black flex items-center justify-center">
        {/* TOP LABEL */}
        <motion.div
          className="absolute top-[18vh] left-1/2 -translate-x-1/2
                     font-mono text-label uppercase tracking-[0.16em] text-text-disabled
                     pointer-events-none whitespace-nowrap"
          style={{ opacity: labelOpacity }}
        >
          {t("label")}
        </motion.div>

        {/* "YOUR ISP SEES" */}
        <motion.div
          className="absolute top-[30vh] left-1/2 -translate-x-1/2
                     font-body font-light text-text-primary
                     text-[clamp(28px,4vw,52px)] leading-[1] tracking-[-0.02em]
                     pointer-events-none whitespace-nowrap"
          style={{ opacity: yourIspOpacity }}
        >
          {t("your_isp_sees")}
        </motion.div>

        {/* NOTHING — DOM text (cipher phase). The same DOM element
            is used by TextErosion as its typography reference so the
            handoff is pixel-perfect. */}
        <motion.div
          ref={domTextRef}
          className="font-body font-medium text-text-display
                     text-[clamp(64px,12vw,160px)] leading-none tracking-[0.18em]
                     whitespace-nowrap tabular-nums pointer-events-none select-none"
          style={{ opacity: domTextOpacity }}
          aria-label={targetWord}
        >
          {cipherText}
        </motion.div>

        {/* NOTHING — Canvas erosion (shatter→void phase) */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{ opacity: canvasOpacity }}
          aria-hidden="true"
        >
          <TextErosion text={targetWord} progress={erosionProgress} matchEl={matchEl} />
        </motion.div>

        {/* META lines */}
        <motion.div
          className="absolute bottom-[26vh] left-1/2 -translate-x-1/2
                     flex flex-col items-center gap-2
                     font-mono text-label uppercase tracking-[0.16em] text-text-secondary
                     pointer-events-none text-center"
          style={{ opacity: metaOpacity }}
        >
          <div>{t("meta_route")}</div>
          <div className="text-text-disabled">{t("meta_invisible")}</div>
        </motion.div>

        {/* (no closing statement — see comment in component body) */}

        {/* SCROLL CUE */}
        <motion.span
          className="absolute bottom-md left-1/2 -translate-x-1/2
                     font-mono text-label uppercase tracking-[0.2em] text-text-disabled
                     pointer-events-none whitespace-nowrap"
          style={{ opacity: cueOpacity, y: cueY }}
        >
          ↓ {t("scroll_cue")}
        </motion.span>
      </div>
    </section>
  );
}
