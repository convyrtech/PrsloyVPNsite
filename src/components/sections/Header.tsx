"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname, type Locale } from "@/i18n/routing";

const SCROLL_THRESHOLD = 80;
const BAR_H = 64;
const HEADER_H = 124;
const NOTCH_W = 240;
const EASE = "cubic-bezier(0.25, 0.1, 0.25, 1)";

export function Header() {
  const t = useTranslations("header");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const otherLocale: Locale = locale === "en" ? "ru" : "en";

  const [scrolled, setScrolled] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const leaveTimer = useRef<number | undefined>(undefined);

  /* Scroll listener — past the threshold the header glides to the corner */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SCROLL_THRESHOLD);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Lock body scroll when mobile menu is open */
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  useEffect(() => () => window.clearTimeout(leaveTimer.current), []);

  /* Open at the top of the page, or while the corner notch is hovered */
  const open = !scrolled || hovered;

  const handleEnter = () => {
    window.clearTimeout(leaveTimer.current);
    setHovered(true);
  };
  const handleLeave = () => {
    window.clearTimeout(leaveTimer.current);
    leaveTimer.current = window.setTimeout(() => setHovered(false), 130);
  };

  const notchExt = open ? 60 : 36;
  const notchH = BAR_H + notchExt;
  const bodyTop = open ? 0 : 10;

  return (
    <>
      <header
        className="fixed top-0 inset-x-0 z-50"
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{
          height: `${HEADER_H}px`,
          pointerEvents: open ? "auto" : "none",
        }}
      >
        {/* Top bar background */}
        <div
          className="absolute inset-x-0 top-0 bg-surface"
          style={{
            height: `${BAR_H}px`,
            opacity: open ? 1 : 0,
            transition: `opacity 300ms ${EASE}`,
          }}
        />

        {/* Hairline divider */}
        <div
          className="absolute inset-x-0"
          style={{
            top: `${BAR_H}px`,
            height: "1px",
            background: "var(--color-border)",
            opacity: open ? 1 : 0,
            transition: `opacity 300ms ${EASE}`,
          }}
        />

        {/* NOTCH — one element; glides between the centre and the top-left corner */}
        <div
          className="hidden md:block absolute cursor-pointer"
          onMouseEnter={handleEnter}
          style={{
            top: open ? "0px" : "14px",
            left: open ? "50%" : "24px",
            transform: open ? "translateX(-50%)" : "translateX(0)",
            width: `${NOTCH_W}px`,
            height: `${notchH}px`,
            pointerEvents: "auto",
            transition: `left 420ms ${EASE}, transform 420ms ${EASE}, top 420ms ${EASE}, height 420ms ${EASE}`,
          }}
        >
          {/* Notch body — surface block; rounds into a full pill in the corner */}
          <div
            className="absolute inset-x-0"
            style={{
              top: `${bodyTop}px`,
              height: `${notchH - bodyTop}px`,
              background: "var(--color-surface)",
              borderTopLeftRadius: open ? "0px" : "28px",
              borderTopRightRadius: open ? "0px" : "28px",
              borderBottomLeftRadius: "28px",
              borderBottomRightRadius: "28px",
              boxShadow: open
                ? "0 0 0 0 rgba(0,0,0,0)"
                : "0 8px 32px -4px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05)",
              transition: `top 420ms ${EASE}, height 420ms ${EASE}, border-radius 420ms ${EASE}, box-shadow 420ms ${EASE}`,
            }}
          />

          {/* Inverse fillets — blend the notch into the bar; fade out in the corner */}
          <div
            aria-hidden="true"
            className="absolute"
            style={{
              top: `${BAR_H}px`,
              left: "-16px",
              width: "16px",
              height: "16px",
              background: "var(--color-surface)",
              opacity: open ? 1 : 0,
              transition: `opacity 240ms ${EASE}`,
              WebkitMaskImage:
                "radial-gradient(circle 16px at 0 16px, transparent 0 16px, #000 16px)",
              maskImage:
                "radial-gradient(circle 16px at 0 16px, transparent 0 16px, #000 16px)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute"
            style={{
              top: `${BAR_H}px`,
              right: "-16px",
              width: "16px",
              height: "16px",
              background: "var(--color-surface)",
              opacity: open ? 1 : 0,
              transition: `opacity 240ms ${EASE}`,
              WebkitMaskImage:
                "radial-gradient(circle 16px at 16px 16px, transparent 0 16px, #000 16px)",
              maskImage:
                "radial-gradient(circle 16px at 16px 16px, transparent 0 16px, #000 16px)",
            }}
          />

          {/* Notch content */}
          <div className="relative z-10 flex flex-col items-center justify-center gap-1 h-full pt-2">
            <div
              className="font-display tracking-[0.15em] leading-none"
              style={{
                fontSize: open ? "20px" : "16px",
                color: "#ffffff",
                WebkitTextFillColor: "#ffffff",
                transition: `font-size 420ms ${EASE}`,
              }}
            >
              PRSLOY
            </div>
            <div
              className="flex items-center gap-2 mt-1 font-mono text-text-disabled uppercase whitespace-nowrap"
              style={{ fontSize: "10px", letterSpacing: "0.1em" }}
            >
              <span className="relative inline-flex w-[6px] h-[6px] rounded-full pulse-dot" />
              <span>{t("status_short")}</span>
            </div>
          </div>
        </div>

        {/* HEADER ROW — nav spreads outward from the centre as the header opens */}
        <div
          className="relative grid items-center px-md md:px-2xl"
          style={{ height: `${BAR_H}px`, gridTemplateColumns: "1fr auto 1fr" }}
        >
          {/* LEFT NAV */}
          <nav
            className="hidden md:flex items-center gap-xl"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "translateX(0)" : "translateX(48px)",
              pointerEvents: open ? "auto" : "none",
              transition: `opacity 300ms ${EASE}, transform 420ms ${EASE}`,
              transitionDelay: open ? "70ms" : "0ms",
            }}
          >
            <NavLink href="/pricing" current={pathname} tone="primary">
              {t("nav_pricing")}
            </NavLink>
            <NavLink href="/faq" current={pathname}>
              {t("nav_faq")}
            </NavLink>
          </nav>

          {/* MOBILE: small PRSLOY brand on left (no notch) */}
          <div
            className="md:hidden flex items-center"
            style={{
              opacity: open ? 1 : 0,
              transition: `opacity 300ms ${EASE}`,
            }}
          >
            <Link
              href="/"
              className="font-display text-text-display tracking-[0.12em] leading-none"
              style={{ fontSize: "18px" }}
            >
              PRSLOY
            </Link>
          </div>

          {/* CENTER spacer (notch occupies this on desktop) */}
          <div />

          {/* RIGHT NAV (desktop) */}
          <nav
            className="hidden md:flex items-center justify-end gap-lg"
            style={{
              opacity: open ? 1 : 0,
              transform: open ? "translateX(0)" : "translateX(-48px)",
              pointerEvents: open ? "auto" : "none",
              transition: `opacity 300ms ${EASE}, transform 420ms ${EASE}`,
              transitionDelay: open ? "70ms" : "0ms",
            }}
          >
            <NavLink href="/blog" current={pathname}>
              {t("nav_blog")}
            </NavLink>
            <NavLink href="/dashboard" current={pathname} tone="muted">
              {t("nav_dashboard")}
            </NavLink>

            <LangToggle currentLocale={locale} otherLocale={otherLocale} />

            <BuyCta label={t("cta_buy")} />
          </nav>

          {/* MOBILE: BUY CTA + burger toggle */}
          <div
            className="md:hidden flex items-center justify-end gap-md"
            style={{
              opacity: open ? 1 : 0,
              pointerEvents: open ? "auto" : "none",
              transition: `opacity 300ms ${EASE}`,
            }}
          >
            <BuyCta label={t("cta_buy")} compact />
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? t("menu_close") : t("menu_open")}
              aria-expanded={mobileOpen}
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center
                         font-mono text-label uppercase text-text-secondary tracking-[0.08em]
                         hover:text-text-display transition-colors duration-150"
            >
              {mobileOpen ? t("menu_close") : t("menu_open")}
            </button>
          </div>
        </div>
      </header>

      {/* MOBILE FULL-SCREEN MENU */}
      <MobileMenu
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        currentLocale={locale}
        otherLocale={otherLocale}
        currentPath={pathname}
      />
    </>
  );
}

/* ─────────────────────────────────────────────
   NavLink — three tone tiers (primary / default / muted)
   ───────────────────────────────────────────── */
type NavTone = "primary" | "default" | "muted";

function NavLink({
  href,
  current,
  tone = "default",
  children,
}: {
  href: string;
  current: string;
  tone?: NavTone;
  children: React.ReactNode;
}) {
  const isActive = current === href;
  const baseColor =
    tone === "primary"
      ? "text-text-primary"
      : tone === "muted"
        ? "text-text-disabled"
        : "text-text-secondary";

  return (
    <Link
      href={href as "/pricing"}
      className={`
        relative font-mono text-label uppercase tracking-[0.08em]
        transition-all duration-150 ease-out-nothing
        hover:text-text-display hover:tracking-[0.12em]
        ${isActive ? "text-text-display" : baseColor}
      `}
    >
      {children}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute -bottom-2 left-0 right-0 h-[2px] bg-text-display"
        />
      )}
    </Link>
  );
}

/* ─────────────────────────────────────────────
   Language toggle — pipe separator
   ───────────────────────────────────────────── */
function LangToggle({
  currentLocale,
  otherLocale,
}: {
  currentLocale: Locale;
  otherLocale: Locale;
}) {
  const pathname = usePathname();
  return (
    <span className="inline-flex items-center gap-2 font-mono text-label tracking-[0.08em]">
      <span className="text-text-display uppercase">{currentLocale}</span>
      <span className="text-text-disabled">|</span>
      <Link
        href={pathname as "/"}
        locale={otherLocale}
        className="text-text-disabled hover:text-text-secondary uppercase
                   transition-colors duration-150 ease-out-nothing"
      >
        {otherLocale}
      </Link>
    </span>
  );
}

/* ─────────────────────────────────────────────
   Buy CTA — primary white pill
   ───────────────────────────────────────────── */
function BuyCta({ label, compact = false }: { label: string; compact?: boolean }) {
  return (
    <Link
      href="/pricing"
      className={`
        inline-flex items-center justify-center
        bg-text-display text-black font-mono uppercase tracking-[0.08em]
        rounded-full
        hover:opacity-90 active:scale-[0.98]
        transition-all duration-150 ease-out-nothing
        ${compact ? "px-md min-h-[44px] text-[10px]" : "px-lg min-h-[44px] text-label"}
      `}
    >
      [ {label} ]
    </Link>
  );
}

/* ─────────────────────────────────────────────
   Mobile full-screen menu
   ───────────────────────────────────────────── */
function MobileMenu({
  open,
  onClose,
  currentLocale,
  otherLocale,
  currentPath,
}: {
  open: boolean;
  onClose: () => void;
  currentLocale: Locale;
  otherLocale: Locale;
  currentPath: string;
}) {
  const t = useTranslations("header");
  if (!open) return null;

  const items = [
    { href: "/pricing", label: t("nav_pricing") },
    { href: "/faq", label: t("nav_faq") },
    { href: "/blog", label: t("nav_blog") },
    { href: "/dashboard", label: t("nav_dashboard") },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black md:hidden flex flex-col">
      {/* Top row spacer matching header (so menu items don't overlap header) */}
      <div className="h-[64px] flex-shrink-0" />

      {/* Navigation list */}
      <nav className="flex-1 flex flex-col items-center justify-center gap-xl px-lg">
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href as "/pricing"}
            onClick={onClose}
            className={`
              font-display text-display-md tracking-[0.04em]
              transition-colors duration-150
              ${currentPath === it.href ? "text-text-display" : "text-text-primary"}
              hover:text-text-display
            `}
          >
            {it.label}
          </Link>
        ))}
      </nav>

      {/* Bottom row — language + status */}
      <div className="flex-shrink-0 px-lg pb-2xl flex items-center justify-between
                      font-mono text-label uppercase tracking-[0.08em]">
        <span className="inline-flex items-center gap-2">
          <span className="text-text-display">{currentLocale}</span>
          <span className="text-text-disabled">|</span>
          <Link
            href={currentPath as "/"}
            locale={otherLocale}
            onClick={onClose}
            className="text-text-disabled hover:text-text-secondary"
          >
            {otherLocale}
          </Link>
        </span>

        <span className="inline-flex items-center gap-2 text-text-disabled">
          <span className="relative inline-flex w-[6px] h-[6px] rounded-full pulse-dot" />
          {t("status_short")}
        </span>
      </div>
    </div>
  );
}
