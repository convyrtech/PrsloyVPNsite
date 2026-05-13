"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring, useTransform } from "motion/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { HeroParticles } from "@/components/sections/HeroParticles";
import { HandshakePanel } from "@/components/sections/HandshakePanel";
import { GlobeUIOverlay } from "@/components/sections/GlobeUIOverlay";

const GlobeImpl = dynamic(
  () => import("./GlobeImpl").then((m) => m.GlobeImpl),
  { ssr: false, loading: () => null }
);

/**
 * Single scroll-driven stage that orchestrates Hero → Handshake → Globe.
 *
 * 320vh tall, sticky 100vh inner. Every element is transformed by scroll
 * progress into a continuous cinematic sequence.
 *
 * Phase map (scrollYProgress):
 *   0.00 — 0.18  HERO IDLE        (particles + headline at rest)
 *   0.18 — 0.32  EVAPORATION      (headline peels right; particles shrink+drift)
 *   0.32 — 0.62  HANDSHAKE        (mechanical loading panel)
 *   0.55 — 0.78  GLOBE EMERGES    (3D scene mounts, scales up)
 *   0.78 — 0.95  GLOBE UI APPEARS (label, metrics, CTA reveal)
 *   0.95 — 1.00  HOLD             (globe fully present, ready for next section)
 */
export function ScrollStage() {
  const t = useTranslations("hero");
  const stageRef = useRef<HTMLElement | null>(null);
  const [isTouch, setIsTouch] = useState(false);
  const [shouldMountGlobe, setShouldMountGlobe] = useState(false);

  const { scrollYProgress: rawProgress } = useScroll({
    target: stageRef,
    offset: ["start start", "end end"],
  });

  // Smooth the scroll progress with a spring — gives inertial feel,
  // softens jerky wheel input. All useTransform below derive from this.
  const scrollYProgress = useSpring(rawProgress, {
    stiffness: 90,
    damping: 28,
    mass: 0.4,
    restDelta: 0.0005,
  });

  useEffect(() => {
    setIsTouch(
      "ontouchstart" in window ||
        (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0)
    );
  }, []);

  // Lazy-mount globe once user is ~halfway through evaporation.
  // Use rawProgress (not smoothed) so the trigger fires immediately
  // when user crosses the threshold, even if spring is still catching up.
  useEffect(() => {
    const unsub = rawProgress.on("change", (v) => {
      if (v > 0.32 && !shouldMountGlobe) setShouldMountGlobe(true);
    });
    return unsub;
  }, [rawProgress, shouldMountGlobe]);

  // ── HERO PARTICLES (scale + drift to top-left) ──
  const heroScale = useTransform(scrollYProgress, [0.18, 0.35], [1, 0.4], { clamp: true });
  const heroX = useTransform(scrollYProgress, [0.18, 0.35], ["0%", "-32%"], { clamp: true });
  const heroY = useTransform(scrollYProgress, [0.18, 0.35], ["0%", "-34%"], { clamp: true });
  const heroOpacity = useTransform(scrollYProgress, [0.30, 0.40], [1, 0], { clamp: true });

  // ── HEADLINE BLOCK ──
  // Plain text — peels off via x/opacity during evaporation phase.
  const headlineX = useTransform(scrollYProgress, [0.15, 0.28], [0, 200], { clamp: true });
  const headlineOpacity = useTransform(scrollYProgress, [0.15, 0.27], [1, 0], { clamp: true });

  // CTA + sub-text — visible at load, exit during evaporation
  const ctaY = useTransform(scrollYProgress, [0.15, 0.27], [0, 40], { clamp: true });
  const ctaOpacity = useTransform(scrollYProgress, [0.15, 0.27], [1, 0], { clamp: true });

  // ── LAUNCH STRIP — visible at load
  const stripOpacity = useTransform(scrollYProgress, [0.12, 0.22], [1, 0], { clamp: true });

  // ── HANDSHAKE PANEL — overlap with hero exit, no dead frame
  const handshakeOpacity = useTransform(
    scrollYProgress,
    [0.22, 0.32, 0.58, 0.66],
    [0, 1, 1, 0],
    { clamp: true }
  );
  const handshakeScale = useTransform(scrollYProgress, [0.22, 0.32], [0.92, 1], { clamp: true });
  const handshakeProgress = useTransform(scrollYProgress, [0.30, 0.55], [0, 1], { clamp: true });

  // ── GLOBE LAYER ──
  // Peak scale 0.78 instead of 1.0 — was eating 80% of viewport, now feels
  // contained. Exit shrink 0.92→1.0 sends it flying up & out before next act.
  const globeOpacity = useTransform(
    scrollYProgress,
    [0.58, 0.72, 0.92, 1.0],
    [0, 1, 1, 0],
    { clamp: true }
  );
  const globeScale = useTransform(
    scrollYProgress,
    [0.58, 0.80, 0.92, 1.0],
    [0.25, 0.78, 0.78, 0.32],
    { clamp: true }
  );
  const globeY = useTransform(
    scrollYProgress,
    [0.92, 1.0],
    ["0%", "-22%"],
    { clamp: true }
  );
  const globeRotate = useTransform(scrollYProgress, [0.58, 0.80], [-12, 0], { clamp: true });

  // ── GLOBE OVERLAY UI ──
  // Compressed window so overlay fully fades before globe departs (was 0.78-0.95)
  const overlayProgress = useTransform(scrollYProgress, [0.78, 0.88, 0.92, 1.0], [0, 1, 1, 0], { clamp: true });

  // (removed: stuck-logo was redundant with the shrunken HeroParticles
  //  during 0.18–0.35; from 0.40+ the screen is occupied by handshake/globe
  //  so the watermark adds no value.)

  return (
    <section
      ref={stageRef}
      className="w-full bg-black"
      // Explicit `position: relative` (avoid relying on Tailwind class —
      // motion's useScroll warns when target has computed `position: static`)
      // Taller scroll range = more gentle progression per wheel tick.
      // Combined with the spring above, motion feels deliberate, not jerky.
      style={{ height: "420vh", position: "relative" }}
    >
      <div
        className="sticky top-0 left-0 right-0 h-screen overflow-hidden bg-black"
        style={{ perspective: 1400 }}
      >
        {/* ─────── LAYER 1: HERO PARTICLES ─────── */}
        <motion.div
          className="absolute inset-0 z-10 origin-center"
          style={{
            scale: heroScale,
            x: heroX,
            y: heroY,
            opacity: heroOpacity,
            willChange: "transform, opacity",
          }}
        >
          <HeroParticles text="PRSLOY" />
        </motion.div>

        {/* ─────── LAYER 2: HERO HEADLINE + SUB + CTA ─────── */}
        {/* Mobile: centered, padded both sides — prevents overflow.
            Desktop (md+): pinned to bottom-right, max-w-md, right-aligned. */}
        <motion.div
          className="absolute z-20 text-center px-lg
                     bottom-[clamp(72px,12vh,120px)] left-0 right-0
                     md:px-0 md:max-w-2xl md:mx-auto"
          style={{ x: headlineX, opacity: headlineOpacity, willChange: "transform, opacity" }}
        >
          <h1 className="font-body font-light text-text-display
                         text-[clamp(22px,3.5vw,48px)] leading-[1.15] tracking-[-0.02em]
                         text-center break-words max-w-full">
            <span className="block">{t("headline_line1")}</span>
            {t("headline_line2") && (
              <span className="block font-medium">{t("headline_line2")}</span>
            )}
          </h1>

          <motion.p
            className="mt-md md:mt-lg font-mono text-label uppercase text-text-secondary
                       break-words max-w-full"
            style={{ opacity: ctaOpacity }}
          >
            {t("sub_price")}
          </motion.p>
          <motion.p
            className="mt-xs font-mono text-label uppercase text-text-disabled
                       break-words max-w-full"
            style={{ opacity: ctaOpacity }}
          >
            {t("sub_features")}
          </motion.p>

          <motion.div style={{ y: ctaY, opacity: ctaOpacity }}>
            <Link
              href="/pricing"
              className="inline-block mt-lg md:mt-xl bg-text-display text-black
                         font-mono text-body-sm uppercase tracking-[0.08em]
                         px-xl py-md rounded-full pointer-events-auto
                         hover:opacity-90 active:scale-[0.98]
                         transition-all duration-150 ease-out-nothing"
            >
              [ {t("cta")} ]
            </Link>
          </motion.div>
        </motion.div>

        {/* ─────── LAYER 4: LAUNCH STRIP ─────── */}
        <motion.div
          className="absolute bottom-0 left-0 right-0 z-20 pointer-events-none"
          style={{ opacity: stripOpacity }}
        >
          <div className="px-lg py-md flex items-center justify-center gap-md">
            <div className="h-px flex-1 bg-border-visible/40" />
            <span className="font-mono text-label uppercase text-text-disabled tracking-[0.16em] whitespace-nowrap">
              {t("launch_strip")}
            </span>
            <div className="h-px flex-1 bg-border-visible/40" />
          </div>
        </motion.div>

        {/* ─────── LAYER 5: HANDSHAKE PANEL ─────── */}
        <motion.div
          className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
          style={{
            opacity: handshakeOpacity,
            scale: handshakeScale,
            willChange: "transform, opacity",
          }}
        >
          <HandshakePanel progress={handshakeProgress} />
        </motion.div>

        {/* ─────── LAYER 6: GLOBE 3D ─────── */}
        {shouldMountGlobe && (
          <motion.div
            className="absolute inset-0 z-[15]"
            style={{
              opacity: globeOpacity,
              scale: globeScale,
              y: globeY,
              rotate: globeRotate,
              transformOrigin: "center center",
              willChange: "transform, opacity",
            }}
          >
            <div className="absolute inset-0 pointer-events-auto">
              <GlobeImpl chrome={false} />
            </div>
          </motion.div>
        )}

        {/* ─────── LAYER 7: GLOBE UI OVERLAY ─────── */}
        <GlobeUIOverlay progress={overlayProgress} isTouch={isTouch} />
      </div>
    </section>
  );
}
