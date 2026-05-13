"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";

/**
 * Footer — "Departure Board" closing.
 *
 * Metaphor: you're departing the controlled internet. Mission-control
 * tower vibe — mechanical, mono caps, instrumentation.
 *
 * Structure (vertical rhythm hierarchy intentional):
 *   1. Heartbeat — TWO traveling pulses (white + accent), continuous activity
 *   2. Closing headline + CTA on same horizontal band (Z-pattern)
 *   3. Departure board — char-by-char Solari flips, dim STANDBY dot
 *   4. Command panel — strong label/value separation
 *   5. Utility row + outline-stroke wordmark watermark
 */

// ── 12 globe-coherent cities ──
const CITIES: Array<{ code: string; city: string; latency: number }> = [
  { code: "AMS", city: "AMSTERDAM",   latency: 23 },
  { code: "FRA", city: "FRANKFURT",   latency: 18 },
  { code: "LON", city: "LONDON",      latency: 27 },
  { code: "NYC", city: "NEW YORK",    latency: 92 },
  { code: "TYO", city: "TOKYO",       latency: 184 },
  { code: "SIN", city: "SINGAPORE",   latency: 156 },
  { code: "SAO", city: "SAO PAULO",   latency: 211 },
  { code: "LAX", city: "LOS ANGELES", latency: 138 },
  { code: "ZRH", city: "ZURICH",      latency: 31 },
  { code: "STO", city: "STOCKHOLM",   latency: 38 },
  { code: "TOR", city: "TORONTO",     latency: 96 },
  { code: "WAW", city: "WARSAW",      latency: 41 },
];

// ── Solari char-by-char flap ──
const SOLARI_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function FlapText({
  text,
  className = '',
  align = 'left',
  wakeup = false,
}: {
  text: string;
  className?: string;
  align?: 'left' | 'right';
  /** When true, cycle through random chars before settling — Solari wakeup */
  wakeup?: boolean;
}) {
  const [displayChars, setDisplayChars] = useState<string[]>(() => text.split(''));

  useEffect(() => {
    const target = text.split('');
    if (!wakeup) {
      setDisplayChars(target);
      return;
    }
    let frame = 0;
    const totalFrames = 16;
    const settleAt = target.map((_, i) => 6 + Math.floor(i * 0.8));
    const id = setInterval(() => {
      frame++;
      const next = target.map((ch, i) => {
        if (frame >= settleAt[i]) return ch;
        if (ch === ' ') return ' ';
        return SOLARI_POOL[Math.floor(Math.random() * SOLARI_POOL.length)];
      });
      setDisplayChars(next);
      if (frame >= totalFrames) clearInterval(id);
    }, 42);
    return () => clearInterval(id);
  }, [text, wakeup]);

  return (
    <span
      className={`inline-flex ${align === "right" ? "justify-end" : "justify-start"} w-full ${className}`}
      style={{ perspective: 400 }}
    >
      {displayChars.map((ch, i) => (
        <motion.span
          key={`${text}-${i}`}
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          transition={{
            duration: 0.32,
            delay: i * 0.035,
            ease: [0.65, 0, 0.35, 1],
          }}
          style={{
            display: 'inline-block',
            transformOrigin: 'center top',
            backfaceVisibility: 'hidden',
          }}
        >
          {ch === ' ' ? ' ' : ch}
        </motion.span>
      ))}
    </span>
  );
}

// ── Departure board row ──
function BoardRow({
  city,
  delay,
  active,
  wakeup = false,
}: {
  city: typeof CITIES[number];
  delay: number;
  active: boolean;
  wakeup?: boolean;
}) {
  const status = active ? "ACTIVE" : "STANDBY";
  return (
    <motion.div
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className="grid grid-cols-[60px_140px_1fr_90px] md:grid-cols-[80px_220px_1fr_100px]
                 gap-md md:gap-lg items-baseline
                 py-md border-b border-border-subtle/50
                 font-mono uppercase tracking-[0.05em]
                 text-[clamp(13px,1.4vw,16px)]
                 text-text-display"
    >
      <FlapText text={city.code} wakeup={wakeup} />
      <FlapText text={city.city} wakeup={wakeup} />
      <span className="flex items-center gap-sm">
        <span
          className={
            "inline-block w-[6px] h-[6px] rounded-full shrink-0 " +
            (active
              ? "bg-[#2BD66A] shadow-[0_0_8px_rgba(43,214,106,0.6)] animate-pulse"
              : "bg-text-secondary/60 ring-1 ring-text-disabled")
          }
        />
        <FlapText
          text={status}
          className={active ? "" : "text-text-disabled"}
          wakeup={wakeup}
        />
      </span>
      <span className="text-right tabular-nums text-text-secondary">
        <FlapText text={`${city.latency}ms`} align="right" wakeup={wakeup} />
      </span>
    </motion.div>
  );
}

// ── Heartbeat: original implementation — pathLength + pathOffset window
// travels through a long EKG path with the spike near the start. Result:
// fading EKG that draws and erases itself across the viewport.
function HeartbeatLine() {
  return (
    <div className="relative w-full h-[40px] overflow-hidden">
      <svg
        className="absolute inset-0 w-full h-full"
        preserveAspectRatio="none"
        viewBox="0 0 1200 40"
      >
        <line
          x1="0" y1="20" x2="1200" y2="20"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="1"
        />
        <motion.path
          d="M 0 20 L 170 20 Q 178 14 186 16 Q 195 22 205 20 L 213 20 L 215 24 L 220 2 L 226 36 L 232 14 L 238 20 L 258 20 Q 268 8 278 12 Q 290 22 305 20 L 1200 20"
          fill="none"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, pathOffset: 0 }}
          animate={{ pathLength: 1, pathOffset: 1 }}
          transition={{
            duration: 4,
            ease: "linear",
            repeat: Infinity,
            repeatType: "loop",
          }}
        />
      </svg>
    </div>
  );
}

export function Footer() {
  const t = useTranslations("footer");
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-15% 0px" });

  // Slowed to 5.5s — readable
  const [boardOffset, setBoardOffset] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const id = window.setInterval(() => {
      setBoardOffset((o) => (o + 1) % CITIES.length);
    }, 5500);
    return () => window.clearInterval(id);
  }, [inView]);

  const visibleCities = Array.from({ length: 4 }, (_, i) =>
    CITIES[(boardOffset + i) % CITIES.length]
  );

  return (
    <section
      ref={sectionRef}
      className="relative w-full bg-black overflow-hidden"
    >
      {/* 1. HEARTBEAT — two traveling pulses */}
      <HeartbeatLine />

      {/* 2. CLOSING HEADLINE + CTA — stack on tablet & narrower, side-by-side from lg+ */}
      <div className="px-lg md:px-2xl mt-2xl md:mt-[100px] max-w-[1400px] mx-auto overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-2xl lg:gap-xl">
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            className="font-body font-bold italic text-text-display
                       text-[clamp(40px,8vw,96px)] leading-[0.9]
                       tracking-[-0.03em] flex-1 min-w-0 break-words"
          >
            {t("closing_line1")}
            <br />
            {t("closing_line2")}
          </motion.h2>

          {/* CTA stacks below on <lg viewports so the headline never squeezes it off-screen */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="flex flex-col items-start lg:items-end gap-sm shrink-0 lg:pb-md"
          >
            <motion.button
              type="button"
              animate={inView ? { scale: [1, 1.025, 1] } : {}}
              transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              style={{ backgroundColor: "#ffffff", color: "#000000" }}
              className="group relative inline-flex items-center gap-md
                         px-2xl py-lg
                         font-mono text-[15px] uppercase tracking-[0.16em] font-bold
                         transition-colors duration-200 ease-out-nothing
                         shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_20px_60px_-10px_rgba(255,255,255,0.15)]
                         hover:bg-[#FF3D2E] hover:text-white"
            >
              <span>{t("cta")}</span>
              <span className="opacity-50">→</span>
              <span>$5</span>
            </motion.button>
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              {t("cta_meta")}
            </span>
          </motion.div>
        </div>
      </div>

      {/* 3. DEPARTURE BOARD */}
      <div className="px-lg md:px-2xl mt-3xl md:mt-[140px] max-w-[1400px] mx-auto">
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.6 }}
          className="flex items-baseline justify-between mb-lg"
        >
          <p className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
            ── {t("departure_label")}
          </p>
          <p className="font-mono text-label uppercase tracking-[0.16em] text-accent flex items-center gap-sm">
            <span className="inline-block w-[6px] h-[6px] rounded-full bg-accent animate-pulse" />
            {t("departure_sub")}
          </p>
        </motion.div>

        {/* Header row — matches data row grid exactly. STATE indented to align with data (skip dot+gap width) */}
        <div className="grid grid-cols-[60px_140px_1fr_90px] md:grid-cols-[80px_220px_1fr_100px]
                        gap-md md:gap-lg
                        pb-sm border-b border-border-visible/30
                        font-mono text-[10px] uppercase tracking-[0.16em] text-text-disabled">
          <span>CODE</span>
          <span>NODE</span>
          <span className="pl-[14px]">STATE</span>
          <span className="text-right">PING</span>
        </div>

        {/* Live rows — keyed by offset+i so React remounts → triggers Solari flap.
            Wakeup ON for the very first batch (boardOffset === 0) for entrance drama. */}
        <div className="relative">
          {visibleCities.map((city, i) => (
            <BoardRow
              key={`${boardOffset}-${i}`}
              city={city}
              delay={i * 0.08}
              active={i < 3}
              wakeup={boardOffset === 0}
            />
          ))}
        </div>
      </div>

      {/* 4. COMMAND PANEL — strong label/value hierarchy */}
      <div className="px-lg md:px-2xl mt-2xl md:mt-[80px] max-w-[1400px] mx-auto">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 0.8 }}
          className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled mb-lg"
        >
          ── {t("command_label")}
        </motion.p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border-subtle">
          {[
            { l: t("metric_status"),  v: t("metric_status_value"),  accent: true  },
            { l: t("metric_uptime"),  v: t("metric_uptime_value"),  accent: false },
            { l: t("metric_nodes"),   v: t("metric_nodes_value"),   accent: false },
            { l: t("metric_launch"),  v: t("metric_launch_value"),  accent: false },
          ].map((m, i) => (
            <motion.div
              key={m.l}
              initial={{ opacity: 0 }}
              animate={inView ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: 1.0 + i * 0.08 }}
              className="bg-bg-primary p-lg flex flex-col gap-lg min-h-[140px] justify-between"
            >
              {/* Tiny faded label */}
              <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-text-disabled/70">
                {m.l}
              </span>
              {/* Value — bigger, bolder, dominant */}
              <span className="font-mono uppercase tracking-[0.02em] text-text-display
                               text-[clamp(15px,1.6vw,19px)] leading-[1.15] font-medium
                               flex items-center gap-sm">
                {m.accent && (
                  <span className="inline-block w-[6px] h-[6px] rounded-full bg-[#2BD66A]
                                   shadow-[0_0_8px_rgba(43,214,106,0.6)] animate-pulse shrink-0" />
                )}
                {m.v}
              </span>
            </motion.div>
          ))}
        </div>
      </div>

      {/* 5. UTILITY ROW + WATERMARK WORDMARK */}
      <div className="px-lg md:px-2xl mt-3xl md:mt-[120px] max-w-[1400px] mx-auto pb-2xl">
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6, delay: 1.4 }}
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-lg
                     pt-lg border-t border-border-subtle"
        >
          {/* Left: navigation */}
          <nav className="flex flex-wrap gap-lg font-mono text-[12px] uppercase tracking-[0.16em] text-text-secondary">
            <Link href="/#pricing" className="hover:text-text-display transition-colors">
              {t("nav_pricing")}
            </Link>
            <Link href="/faq" className="hover:text-text-display transition-colors">
              {t("nav_faq")}
            </Link>
            <Link href="/blog" className="hover:text-text-display transition-colors">
              {t("nav_blog")}
            </Link>
            <Link href="/dashboard" className="hover:text-text-display transition-colors">
              {t("nav_dashboard")}
            </Link>
            <Link href="/privacy" className="hover:text-text-display transition-colors">
              {t("nav_privacy")}
            </Link>
            <Link href="/terms" className="hover:text-text-display transition-colors">
              {t("nav_terms")}
            </Link>
          </nav>

          {/* Right: Telegram link */}
          <a
            href="https://t.me/prsloy_bot"
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[12px] uppercase tracking-[0.16em] text-text-display
                       flex items-center gap-sm group hover:text-accent transition-colors"
          >
            <span className="inline-block w-[6px] h-[6px] rounded-full bg-accent group-hover:bg-text-display transition-colors" />
            {t("telegram")} →
          </a>
        </motion.div>

        {/* Outline wordmark — watermark, not duplicate brand */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 1.2, delay: 1.6 }}
          className="mt-2xl md:mt-3xl"
        >
          <h3
            className="font-body font-bold italic leading-[0.82]
                       tracking-[-0.06em] select-none whitespace-nowrap overflow-hidden max-w-full"
            style={{
              fontSize: "clamp(64px, 14vw, 180px)",
              color: "transparent",
              WebkitTextStroke: "1px rgba(255,255,255,0.55)",
            }}
          >
            PRSLOY
          </h3>
          <div className="mt-md flex flex-wrap items-center gap-md
                          font-mono text-[10px] uppercase tracking-[0.2em] text-text-disabled">
            <span>{t("wordmark_meta")}</span>
            <span className="opacity-40">·</span>
            <span>{t("copyright")}</span>
            <span className="opacity-40">·</span>
            <span>{t("version")}</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
