"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useSpring, useTransform, useReducedMotion } from "motion/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { HeroParticles } from "@/components/sections/HeroParticles";
import { GlobeUIOverlay } from "@/components/sections/GlobeUIOverlay";
import { Bracketed } from "@/components/ui/Bracketed";

const GlobeImpl = dynamic(
  () => import("./GlobeImpl").then((m) => m.GlobeImpl),
  { ssr: false, loading: () => null }
);

/**
 * Single scroll-driven stage: HERO → GLOBE, cross-dissolving with no black gap.
 *
 * The old middle "handshake" act (a fake loading bar) is gone — the globe now
 * fades in WHILE the particle wordmark is still scattering, so the two overlap
 * and the screen is never empty for a frame.
 *
 * Phase map (scrollYProgress):
 *   0.00 — 0.18  HERO IDLE        (particles + headline at rest)
 *   0.18 — 0.40  DISASSEMBLY      (wordmark scatters; headline / CTA / strip fade)
 *   0.28 — 0.58  GLOBE EMERGES    (fades in over the scattering hero — no dead frame)
 *   0.56 — 0.88  GLOBE UI APPEARS (label, metrics, CTA reveal)
 *   0.88 — 1.00  HOLD             (globe present, then yields to NothingStage)
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

  // Smooth the scroll progress with a spring — gives inertial feel, softens
  // jerky wheel input. All useTransform below derive from this.
  const scrollYProgress = useSpring(rawProgress, {
    stiffness: 190,
    damping: 32,
    mass: 0.2,
    restDelta: 0.0003,
  });

  useEffect(() => {
    setIsTouch(
      "ontouchstart" in window ||
        (navigator.maxTouchPoints != null && navigator.maxTouchPoints > 0)
    );
  }, []);

  // Mount the heavy WebGL globe early (well before it must fade in at 0.28) so
  // it is fully built by the time the hero starts scattering — no blank frame.
  useEffect(() => {
    const unsub = rawProgress.on("change", (v) => {
      if (v > 0.08 && !shouldMountGlobe) setShouldMountGlobe(true);
    });
    return unsub;
  }, [rawProgress, shouldMountGlobe]);

  // ── HERO PARTICLES — wordmark disassembles back into chaos, alpha→0 by 0.40 ──
  const exitProgress = useTransform(scrollYProgress, [0.16, 0.36], [0, 1], { clamp: true });

  // In reduced motion the particles draw once and never scatter, so fade the
  // whole hero layer out on scroll instead — otherwise the static wordmark
  // would linger over the globe.
  const reduce = useReducedMotion();
  const heroLayerOpacity = useTransform(scrollYProgress, [0.16, 0.36], [1, 0], { clamp: true });

  // ── HEADLINE BLOCK — percussive fade with a small downward tick ──
  const headlineY = useTransform(scrollYProgress, [0.14, 0.27], [0, 8], { clamp: true });
  const headlineOpacity = useTransform(rawProgress, [0.14, 0.27], [1, 0], { clamp: true });
  const ctaOpacity = useTransform(rawProgress, [0.14, 0.27], [1, 0], { clamp: true });

  // ── LAUNCH STRIP — visible at load ──
  const stripOpacity = useTransform(rawProgress, [0.08, 0.18], [1, 0], { clamp: true });

  // ── GLOBE LAYER ──
  // Fades in at 0.28 — while the hero is still scattering (0.18→0.40) — so the
  // two overlap and the composition is never empty. Holds, then fades by 0.98
  // as NothingStage rises over it.
  const globeOpacity = useTransform(
    rawProgress,
    [0.26, 0.44, 0.93, 0.99],
    [0, 1, 1, 0],
    { clamp: true }
  );
  const globeScale = useTransform(
    scrollYProgress,
    [0.26, 0.50, 0.93, 0.99],
    [0.28, 0.82, 0.82, 0.72],
    { clamp: true }
  );
  const globeY = useTransform(scrollYProgress, [0.93, 0.99], ["0%", "-8%"], { clamp: true });
  const globeRotate = useTransform(scrollYProgress, [0.26, 0.50], [-12, 0], { clamp: true });

  // ── GLOBE OVERLAY UI — revealed once the globe is up; held to section end so
  //    the user never sees dead screen before NothingStage starts. ──
  const overlayProgress = useTransform(
    rawProgress,
    [0.46, 0.60, 0.92, 0.98],
    [0, 1, 1, 0],
    { clamp: true }
  );

  return (
    <section
      ref={stageRef}
      className="relative w-full bg-black"
      // Two acts (hero → globe). 420vh gives the globe a long, satisfying dwell
      // after it assembles (340vh felt rushed) while the hero→globe cross-fade
      // keeps it free of dead/black screens. Clamped for tall/short viewports.
      style={{ height: "clamp(2900px, 420vh, 4800px)" }}
    >
      <div
        className="sticky top-0 left-0 right-0 h-[100svh] overflow-hidden bg-black
                   pt-[clamp(72px,8vh,112px)]"
        style={{ perspective: 1400 }}
      >
        {/* ─────── LAYER 1: HERO PARTICLES ─────── */}
        <motion.div
          className="absolute inset-0 z-10"
          style={{ opacity: reduce ? heroLayerOpacity : 1 }}
        >
          <HeroParticles text="PRSLOY" exitProgress={exitProgress} />
        </motion.div>

        {/* ─────── LAYER 2: HERO HEADLINE + SUB + CTA ─────── */}
        {/* Particle PRSLOY lives in the upper third; hero text in the lower band
            (bottom-center on mobile, bottom-right on md+) — different vertical
            bands so they never collide regardless of widths. */}
        <motion.div
          className="absolute z-20 text-center px-lg
                     bottom-[clamp(64px,12vh,128px)] left-0 right-0
                     md:left-auto md:px-0 md:right-10 md:max-w-2xl md:text-right"
          style={{ y: headlineY, opacity: headlineOpacity, willChange: "transform, opacity" }}
        >
          <h1 className="font-body font-light text-text-display
                         text-[clamp(22px,3.2vw,44px)] leading-[1.15] tracking-[-0.02em]
                         text-center md:text-right break-words max-w-full">
            <span className="block">{t("headline_line1")}</span>
            {t("headline_line2") && (
              <span className="block font-medium">{t("headline_line2")}</span>
            )}
          </h1>

          {t("sub_features") && (
            <motion.p
              className="mt-md md:mt-lg font-body text-body text-text-secondary
                         break-words max-w-full leading-relaxed"
              style={{ opacity: ctaOpacity }}
            >
              {t("sub_features")}
            </motion.p>
          )}

          <motion.div style={{ opacity: ctaOpacity }}>
            <Link
              href="/pricing"
              className="group inline-block mt-lg md:mt-xl bg-text-display text-black
                         font-mono text-body-sm uppercase tracking-[0.08em] whitespace-nowrap
                         px-lg md:px-xl py-md rounded-full pointer-events-auto
                         hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98]
                         transition duration-150 ease-out-nothing"
            >
              <Bracketed>{t("cta")}</Bracketed>
            </Link>
          </motion.div>
        </motion.div>

        {/* ─────── LAYER 3: LAUNCH STRIP ─────── */}
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

        {/* ─────── LAYER 4: GLOBE 3D ─────── */}
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

        {/* ─────── LAYER 5: GLOBE UI OVERLAY ─────── */}
        <GlobeUIOverlay progress={overlayProgress} isTouch={isTouch} />
      </div>
    </section>
  );
}
