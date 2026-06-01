"use client";

import { useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/routing";
import { TELEGRAM_BOT_URL } from "@/lib/links";

const FooterCtaLink = motion.create(Link);

/**
 * Footer — a quiet, confident Nothing-style close.
 *
 * Three layers (Nothing §2.1):
 *   PRIMARY    the oversized italic "ДОСТУП ПО ИНВАЙТУ." closing line
 *   SECONDARY  one white CTA
 *   TERTIARY   utility nav + ghost outline wordmark, pushed to the edges
 *
 * The only motion — and the only red on the screen — is a single packet of
 * light crossing one hairline: the network's lone sign of life. No fake
 * departure board, no invented latency, no instrument-panel salad.
 */

// The one alive signal + the one red (Nothing §2.5): a packet traversing the
// channel. Honours prefers-reduced-motion by resting as a single static dot.
function SignalLine() {
  const reduce = useReducedMotion();
  return (
    <div
      aria-hidden="true"
      className="relative w-full h-10 overflow-hidden"
    >
      {/* The hairline itself — vertically centred so the travelling packet and
          its glow have clearance above/below and aren't clipped at the edge. */}
      <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border-visible/25" />
      {reduce ? (
        <span className="absolute left-1/2 top-1/2 h-[4px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
      ) : (
        <motion.span
          className="absolute top-1/2 h-[4px] w-[4px] -translate-y-1/2 rounded-full bg-accent
                     shadow-[0_0_12px_3px_rgba(215,25,33,0.55)]"
          initial={{ left: "0%", opacity: 0 }}
          animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
          transition={{
            duration: 6,
            ease: "linear",
            repeat: Infinity,
            repeatType: "loop",
            times: [0, 0.08, 0.9, 1],
          }}
        />
      )}
    </div>
  );
}

export function Footer() {
  const t = useTranslations("footer");
  const sectionRef = useRef<HTMLElement | null>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-15% 0px" });

  return (
    <section ref={sectionRef} className="relative w-full bg-black overflow-hidden">
      {/* 1. SIGNAL — the single alive moment, full bleed */}
      <SignalLine />

      {/* 2. CLOSING — primary line + single CTA, deliberately asymmetric */}
      <div className="px-lg md:px-2xl mt-3xl md:mt-[120px] max-w-[1400px] mx-auto">
        <div className="flex flex-col gap-2xl lg:flex-row lg:items-end lg:justify-between lg:gap-xl">
          <motion.h2
            initial={{ opacity: 0, y: 24 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
            className="font-body font-bold italic text-text-display
                       text-[clamp(44px,9vw,104px)] leading-[0.9]
                       tracking-[-0.03em] flex-1 min-w-0 break-words"
          >
            {t("closing_line1")}
            <br />
            {t("closing_line2")}
          </motion.h2>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col items-start lg:items-end gap-md shrink-0 lg:pb-sm"
          >
            <FooterCtaLink
              href="/pricing"
              className="group inline-flex items-center gap-md
                         bg-text-display text-black
                         px-2xl py-lg rounded-full
                         font-mono text-[15px] uppercase tracking-[0.16em] font-medium
                         transition-[opacity,transform] duration-200 ease-out-nothing
                         hover:opacity-90 hover:-translate-y-0.5 active:translate-y-0"
            >
              <span>{t("cta")}</span>
              <span className="transition-transform duration-200 ease-out-nothing group-hover:translate-x-1">
                →
              </span>
            </FooterCtaLink>
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              {t("cta_meta")}
            </span>
          </motion.div>
        </div>
      </div>

      {/* 3. UTILITY NAV — tertiary, pushed down past a vast gap */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 0.6, delay: 0.5 }}
        className="px-lg md:px-2xl mt-3xl md:mt-[140px] max-w-[1400px] mx-auto
                   flex flex-col md:flex-row md:items-center md:justify-between gap-lg
                   pt-lg border-t border-border-visible/20"
      >
        <nav
          className="flex flex-wrap gap-x-lg gap-y-2xs
                     font-mono text-[12px] uppercase tracking-[0.16em] text-text-secondary
                     [&_a]:inline-flex [&_a]:items-center [&_a]:min-h-[44px]
                     [&_a]:hover:text-text-display [&_a]:transition-colors"
        >
          <Link href="/pricing">{t("nav_pricing")}</Link>
          <Link href="/faq">{t("nav_faq")}</Link>
          <Link href="/blog">{t("nav_blog")}</Link>
          <Link href="/dashboard">{t("nav_dashboard")}</Link>
          <Link href="/privacy">{t("nav_privacy")}</Link>
          <Link href="/terms">{t("nav_terms")}</Link>
          <Link href="/refunds">{t("nav_refunds")}</Link>
        </nav>

        <a
          href={TELEGRAM_BOT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-[12px] uppercase tracking-[0.16em] text-text-display
                     inline-flex items-center min-h-[44px] gap-sm hover:opacity-70
                     transition-opacity whitespace-nowrap"
        >
          {t("telegram")} {"→"}
        </a>
      </motion.div>

      {/* 4. WATERMARK — ghost sign-off, never a second hero (Nothing §2.6) */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ duration: 1.2, delay: 0.7 }}
        className="px-lg md:px-2xl mt-2xl md:mt-3xl max-w-[1400px] mx-auto pb-2xl"
      >
        <div
          aria-hidden="true"
          className="font-body font-bold italic leading-[0.82]
                     tracking-[-0.06em] select-none whitespace-nowrap overflow-hidden max-w-full"
          style={{
            fontSize: "clamp(64px, 14vw, 180px)",
            color: "transparent",
            WebkitTextStroke: "1px rgba(255,255,255,0.16)",
          }}
        >
          PRSLOY
        </div>
        <div
          className="mt-md flex flex-wrap items-center gap-md
                     font-mono text-[10px] uppercase tracking-[0.2em] text-text-disabled"
        >
          <span>{t("wordmark_meta")}</span>
          <span className="opacity-40">·</span>
          <span>{t("copyright")}</span>
          <span className="opacity-40">·</span>
          <span>{t("version")}</span>
        </div>
      </motion.div>
    </section>
  );
}
