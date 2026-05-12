# PRSLOY — Landing Page Design

**Date:** 2026-05-04
**Project:** PRSLOY VPN — global crypto-only VPN service
**Audience:** EN + RU (i18n)
**Aesthetic:** Nothing-inspired — Swiss typography, OLED black, mechanical precision
**Target quality:** awwwards site of the month

---

## 1. Product Context

- **What:** VPN service with double-hop routing (RU whitelist → global exit nodes)
- **Payment:** crypto only (BTC / ETH / TON / USDT) — anonymity + no Russian regulatory issues
- **Goals:** (1) sell access (2) SEO + brand image
- **App:** no proprietary client yet — users paste keys into Happ, v2rayNG, Hiddify, Streisand
  - Positioning: "no vendor lock-in" — feature, not limitation
- **Pricing:** $5/month base, possible launch promo

## 2. Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Animation:** Framer Motion + custom Canvas for particles
- **i18n:** next-intl (EN + RU)
- **Backend:** API routes for crypto payments + XUI integration
- **Content:** MDX for blog
- **Deploy:** Vercel or VPS

## 3. Design System

**Fonts (Google Fonts):**
- Doto — display (hero numbers, watermarks)
- Space Grotesk — body, headings
- Space Mono — labels, data, ALL CAPS metadata

**Colors (dark mode primary):**
- `--black` #000000 — background
- `--surface` #111111 — header, elevated areas
- `--border` #222222 — subtle dividers
- `--border-visible` #333333 — intentional borders
- `--text-disabled` #666666 — metadata
- `--text-secondary` #999999 — labels, captions
- `--text-primary` #E8E8E8 — body
- `--text-display` #FFFFFF — headlines, hero
- `--accent` #D71921 — interrupt only (one per screen)
- `--success` #4A9E5C — status online
- `--warning` #D4A843 — degraded

**Spacing scale (8px base):** xs 4, sm 8, md 16, lg 24, xl 32, 2xl 48, 3xl 64, 4xl 96

**Motion:** 150-250ms micro / 300-400ms transitions, easing `cubic-bezier(0.25, 0.1, 0.25, 1)`. No spring/bounce.

**Anti-patterns:** no shadows, no gradients in chrome, no skeleton loaders, no toasts, no parallax, no protocol names visible to users (premium = simplicity).

## 4. Page Structure (Landing)

Seven blocks. Each individually designed.

```
1. HEADER       — notch with live status (Dynamic Island concept)
2. HERO         — particle assembly PRSLOY + cursor magnet + breathing
3. GLOBE        — 3D dot-globe of real geography, great-circle routes from RU to global exits, animated packets, drag-to-rotate (Three.js)
4. NOTHING      — "YOUR ISP SEES NOTHING" with glass shatter on click/scroll
5. PRICING      — frequency selector, odometer price, crypto switcher
6. FAQ          — terminal Q&A with typewriter effect
7. FOOTER       — closing statement + uptime bar + signature
```

**Three killer moments by nature (Nothing rule: one moment per screen, but variety across screens):**
- Hero particles = organic motion ("they have taste")
- Globe = technical proof ("they have real infrastructure")
- Glass shatter = visceral break ("they break censorship")

---

## 5. Block 1: HEADER

**Concept:** Dynamic Island for the web. Full-width header with notch cutout at bottom-center.

**Layout:**
- Full-width, `--surface` (#111) background
- Notch cutout at bottom-center via CSS `clip-path` or SVG mask
- Notch content: PRSLOY (Doto, small) + status dot
- Left of notch: PRICING, FAQ — Space Mono ALL CAPS, `--text-secondary`
- Right of notch: BLOG, DASHBOARD, [EN|RU] toggle

**Status dot:**
- 8px circle, pulses opacity 0.7→1.0, 2sec cycle
- `--success` = all online, `--warning` = partial, `--accent` = problems
- Hover on notch: expands to show `12 SERVERS · 99.7% UPTIME · 3ms`, click → status page

**Active nav indicator:**
- Small segmented bar (3-4 blocks) under active item
- Fills when navigating

**EN/RU toggle:** physical Nothing-style toggle switch (mechanical click)

**Scroll behavior:** notch compresses to compact form (PRSLOY → P), 300ms ease-out

**Mobile:** compact notch + burger menu right

---

## 6. Block 2: HERO

**Concept:** Particle assembly. Letters PRSLOY built from thousands of points, alive with breathing motion, react to cursor.

**Layout:**
```
[empty viewport, OLED black]

         P R S L O Y           ← Doto, ~140px
       (made of particles)

       YOUR TRAFFIC.            ← Space Grotesk 18px, --text-secondary
       YOUR RULES.

         [ GET ACCESS ]         ← pill button, Space Mono ALL CAPS
```

**Animation phases:**
1. **Entry (page load):** thousands of white particles in chaos → assemble into PRSLOY over 2sec
2. **Idle (3 layers superimposed):**
   - Brownian micro-motion (±1-2px random drift)
   - Slow horizontal sine wave (4sec cycle, particles rise 2-3px as wave passes)
   - Scroll reaction: particles compress as user scrolls
3. **Cursor:** magnetic repulsion, ~100px radius, smooth return
4. **Touch (mobile):** finger = cursor, same physics

**Tech:**
- Canvas with requestAnimationFrame
- Particle pool: max 3000 desktop / 1500 mobile
- Each letter = 200-400 particles sampled from font outline
- GPU acceleration via `will-change: transform`

---

## 7. Block 3: ROUTE — "YOUR ISP SEES NOTHING"

**Concept:** Mirror inversion of hero. Where hero assembled, this dissolves. Word NOTHING destroyed by encryption, particles reform into route diagram.

**Section height:** 300vh (sticky scroll-driven)

**Typography:**
- "YOUR ISP" / "SEES" — Space Grotesk 48px Light, `--text-primary`
- "NOTHING" — Space Grotesk 96px Regular, `--text-display`, letter-spacing 0.3em
- All metadata — Space Mono ALL CAPS

**Animation phases (scroll-driven):**

| Phase | Scroll % | What happens |
|-------|----------|-------------|
| 0 | 0-10 | Invisible |
| 1 | 10-25 | "YOUR ISP" → "SEES" → "NOTHING" appears letter-by-letter, 80ms stagger |
| 2 | 25-40 | Static, NOTHING jitters ±0.5px (unstable signal hint) |
| 3a | 40-50 | **Cipher-glitch:** each letter cycles random symbols (50ms/swap), font morphs to Space Mono, color fades |
| 3b | 50-65 | **Particle dissolution:** letters render as canvas dots (~200-400 each), explode rightward+down with physics (gravity 0.02, friction 0.98), ~10% travel right to become route |
| 4 | 65-85 | **Route formation:** particles assemble into horizontal route. Nodes (YOU → ENTRY → EXIT → INTERNET) appear as circles. Cipher-decode reveals metadata under each node |
| 5 | 85-100 | Idle: data packets continuously flow left→right (3-4sec loop). Hover on node = tooltip with status/latency |

**Subtitle (under NOTHING):**
```
DOUBLE-HOP ENCRYPTION
RU WHITELIST → GLOBAL EXIT
YOUR DATA. INVISIBLE.
```

(No protocol names — premium positioning)

**Cursor interaction:**
- Phase 2: cursor on NOTHING → letters deflect 2-3px (unstable hint)
- Phase 3: cursor through dispersing particles → accelerated dispersal
- Phase 5: hover on node = tooltip card

**Mobile:** route flows vertically instead of horizontally, NOTHING at 52px

---

## 8. Block 4: PRICING

**Concept:** Frequency selector — analog tuner aesthetic. One price, switch periods like radio frequencies, switch crypto like channels.

**Section height:** 200vh (sticky)

**Layout:**
```
PRICING                                    (label, top-left)

         [ 1 MO | 6 MO | 1 YR ]           (segmented control)

                    $5                     (Doto 120px)
                  / MONTH                  (Space Mono 14px)

         LAUNCH PRICE · REGULAR $7         (promo, --accent, only if active)
         ▓▓▓▓▓▓░░ 12 DAYS LEFT             (countdown bar)

       [ BTC ] [ ETH ] [ TON ] [ USDT ]   (crypto pills)
              ≈ 0.00017 BTC                (live conversion)

  ── INCLUDES ──

  ENCRYPTION    DEVICES       SPEED
  MILITARY      UNLIMITED     NO LIMITS

  SERVERS       LOGS          SUPPORT
  12 COUNTRIES  ZERO          24/7

              [ GET ACCESS ]               (CTA pill button)
```

**No protocol names anywhere.** Replaced with: ENCRYPTION → MILITARY-GRADE, BANDWIDTH → NO LIMITS, etc.

**Components:**
- Segmented period control: pill 999px radius, white slides to active segment (200ms)
- Price: huge Doto digit
- Crypto pills: 4 in row, white-fill active, outlined inactive
- Feature grid: 2×3, no borders/cards, only spacing groups
- CTA: white pill, black text

**Animation phases (scroll-driven):**

| Phase | What happens |
|-------|-------------|
| 1 | PRICING label → segmented control → price (odometer counter rolls 0→5) → /MONTH |
| 2 | Crypto pills appear sequentially (100ms stagger), BTC default. Conversion appears via cipher-decode |
| 3 | INCLUDES divider draws left→right, feature grid fades in (labels first, values 150ms later) |
| 4 | CTA fades in last, idle state |

**Idle interactions:**
- Period switch → price odometer rolls (each digit flips independently, mechanical)
- Crypto switch → conversion fades out, cipher-decodes new value
- Hover CTA → letter-spacing widens 0.06→0.10em ("doors open" feel)

**GEO adaptation:**
- RU/CIS users: TON shown first
- Global: BTC first
- CTA text: "ПОЛУЧИТЬ ДОСТУП" (RU) / "GET ACCESS" (EN)

**SEO:** Product schema + pricing structured data, hreflang EN/RU

---

## 9. Block 5: FAQ

**Concept:** Terminal Q&A. Question = command, answer = system output. Typewriter effect.

**Layout:**
```
FAQ

01 ─────────────────────────────────────────── [+]
How do I connect?

02 ─────────────────────────────────────────── [-]
How do I pay?

> Choose your plan. Pick crypto: BTC, ETH, TON, or USDT.
> Send payment to the generated address. Your key is
> delivered instantly after confirmation.
>
> No accounts. No emails. No KYC.

03 ─────────────────────────────────────────── [+]
Is my data private?

[etc — 6 questions total]
```

**Questions (EN/RU):**
1. How do I connect? / Как подключиться?
2. How do I pay? / Как оплатить?
3. Is my data private? / Мои данные в безопасности?
4. Which apps work with PRSLOY? / Какие приложения поддерживаются?
5. Can I use on multiple devices? / Можно на нескольких устройствах?
6. What if I need help? / Нужна помощь?

**Apps answer (positioning third-party clients as feature):**
```
> Your key works with any compatible client:
> iOS .......... Happ, Streisand
> Android ...... Happ, v2rayNG
> Windows ...... Hiddify
> macOS ........ Hiddify, Streisand
>
> No vendor lock-in. Your key. Your app.
```

**Animations:**
- Scroll entry: cascade of questions, line draws left→right + question fades in (80ms stagger)
- Click expand: `[+]` rotates → `[-]`, container height 0→auto, then **typewriter** prints answer at 15ms/char with blinking `█` cursor
- Click during typing: instant complete
- Click collapse: text fades 150ms, container collapses 200ms
- Hover question: color → `--text-display`, 150ms

**Accordion:** non-exclusive (multiple can be open). Click anywhere on row to expand.

**Accessibility:** `<details>`/`<summary>` semantic HTML, keyboard navigable

**SEO:** FAQPage schema, content indexed even when collapsed

---

## 10. Block 6: FOOTER (v2 — "The Last Signal")

**Concept:** Closing statement + technical signature. Final beat of the page narrative.

**Layout:**
```
─────────────────────────────────────────────────

YOUR TRAFFIC.                             (Space Grotesk 36px)
YOUR RULES.

[ GET ACCESS ]                            (repeat CTA)


· · · · · · · · · · · · · · · · · · ·     (dot-grid divider)


PRICING · FAQ · BLOG · DASHBOARD · PRIVACY · TERMS
                                          (single line, Space Mono 11px)

© 2026 PRSLOY              TELEGRAM ↗
v1.0.0                     STATUS ●
                           [EN|RU]


▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ 99.7% UPTIME
(30 segments = 30 days, full-width 4px height)


P R S L O Y                               (Doto 120px, opacity 0.04)
```

**Why this beats v1:**
- Closing statement echoes hero tagline → narrative loop closure
- Repeat CTA = standard conversion practice
- Dot-grid divider connects visually to hero particles (start/end symmetry)
- Uptime bar = "data as beauty" (live data IS decoration)
- Single-line nav = bold minimalism (not 3 stuffy columns)
- PRSLOY in Doto = signature, slowly fades in last

**Animations:**
- Scroll entry: typewriter for "YOUR TRAFFIC. YOUR RULES." → CTA → dot-grid cascade (20ms/dot) → nav → bottom bar → uptime bar fills left→right (30ms/segment) → PRSLOY fades 0→0.04 over 1500ms
- Uptime bar idle: today's segment pulses 0.8→1.0 (2sec). Hover segment = tooltip `APR 28 · 100% · 0 INCIDENTS`
- Live metric updates: cipher-decode glitch on value change (consistent with pricing/FAQ language)
- Easter egg: hover bottom third → PRSLOY watermark brightens 0.04→0.08 (800ms slow reveal)

---

## 11. Cross-Cutting Patterns (Animation Language)

Single design language used everywhere — repetition creates coherence:

| Pattern | Used in |
|---------|---------|
| **Particle assembly/dissolution** | Hero (assembly) ↔ Block 3 (dissolution) — mirror pair |
| **Cipher-decode** (random chars → fix) | Block 3 metadata, Block 4 crypto conversion, Footer live metrics |
| **Typewriter** (15ms/char + cursor) | FAQ answers, Footer closing statement |
| **Odometer** (mechanical digit roll) | Pricing |
| **Segmented bars** (discrete blocks, 2px gap) | Header active nav, Promo countdown, Footer uptime |
| **Pulsing status dot** (0.7→1.0, 2sec) | Header notch, Footer status |
| **Dot-grid** (radial-gradient pattern) | Hero bg (particles), Footer divider, Footer watermark bg |

**Easing everywhere:** `cubic-bezier(0.25, 0.1, 0.25, 1)`

---

## 12. Responsive Strategy

**Breakpoints:**
- Mobile: < 768px
- Tablet: 768-1024px
- Desktop: > 1024px

**Mobile adaptations:**
- Hero: PRSLOY 80px (vs 140px), touch instead of cursor
- Block 3: route flows vertically, NOTHING 52px
- Pricing: feature grid → vertical list with dividers, full-width segmented control
- FAQ: questions 18px, typewriter faster (10ms/char)
- Footer: nav wraps to 2-3 lines, bottom bar stacks
- Header: compact notch + burger

**Performance budget:**
- Canvas particles: max 3000 desktop / 1500 mobile
- All scroll animations behind Intersection Observer (paused outside viewport)
- Cipher-decode: text-only DOM updates (no canvas)
- Crypto rates: cached 5min, fallback to static if API down

---

## 13. SEO + i18n Strategy

**Per-page locale routing:** `/en/...` and `/ru/...` via next-intl
**hreflang tags** between EN and RU versions
**Structured data:**
- Landing: `Organization`, `WebSite`
- Pricing block: `Product`, `Offer`
- FAQ block: `FAQPage`
- Footer: `Organization` contact

**Meta strategy:**
- Title: "PRSLOY — Anonymous VPN. Crypto-only payments." / Russian variant
- Description: military-grade encryption, no logs, no KYC
- OG image: PRSLOY in Doto on OLED black

**GEO routing:**
- RU/CIS IP → defaults to RU locale, TON crypto first
- Global → EN locale, BTC first

---

## 14. Open Questions (To resolve before implementation)

1. **Domain name** — prsloy.com? prsloy.io? .vpn?
2. **Crypto payment provider** — own wallets or service like NowPayments / CoinGate?
3. **Backend integration** — endpoints for XUI key generation, payment confirmation
4. **Status page** — separate route /status with detailed server metrics
5. **Blog content strategy** — initial articles for SEO launch
6. **Promo mechanics** — fixed launch period or rolling promo?
7. **Telegram support** — separate bot account or DM to @prsloy_support?

---

## 15. Implementation Order (Suggested)

1. Project scaffold: Next.js 15 + Tailwind + Framer Motion + next-intl + fonts
2. Design tokens (CSS variables) + Tailwind theme extension
3. Header (notch, status, scroll behavior)
4. Hero (particle system foundation)
5. Block 3 (route — reuses particle system)
6. Block 4 (pricing components, odometer, crypto switcher)
7. Block 5 (FAQ accordion + typewriter)
8. Block 6 (footer with uptime bar)
9. i18n integration (EN/RU)
10. SEO meta + structured data
11. QA + performance pass
12. Backend API integration (payments, keys)
