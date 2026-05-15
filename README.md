# PRSLOY

Marketing + waitlist site for **PRSLOY**, an invite-only VPN. Beta.

Stack: Next.js 15 (App Router) · React 19 · Tailwind 3 · next-intl (RU/EN) · TypeScript · motion. Deployed on Vercel.

## Routes

| Path | What it is |
|---|---|
| `/` (`/ru`, `/en`) | Cinematic landing — particle hero → handshake → 3D globe → "your ISP sees nothing" → pricing → FAQ → footer |
| `/pricing` | Period switcher (1/6/12 mo), 6 payment methods, includes grid, waitlist email-capture form |
| `/faq` | 12 questions in 4 categories (product / tech / payment / privacy) |
| `/privacy` · `/terms` | 7-section honest legal pages via `LegalLayout` |
| `/setup` | 3-step Happ install guide with iOS/Android/desktop links |
| `/dashboard` | Telegram-bot CTA + preview of LK features (web LK pending Rollypay) |
| `POST /api/waitlist` | Validates email (lib/validation), optional Telegram-bot notify via env |

## Local dev

```bash
npm install
npm run dev        # Turbopack dev server on http://localhost:3000 (Windows note: may need next start instead)
npm run build      # production build — must stay green
npm run start -- --port 3020
```

## Env vars (optional)

- `TELEGRAM_BOT_TOKEN` + `TELEGRAM_NOTIFY_CHAT_ID` — forward waitlist signups to a Telegram chat. Without them the endpoint still logs every signup to `console.log` (visible in Vercel logs).
- `NEXT_PUBLIC_SITE_URL` — overrides default for canonical / OG URLs.

## Manual VPN grant

Payments and VPN-panel provisioning are not automated yet. For beta access:

1. Create the real subscription/config link in the VPN panel.
2. Open `/ru/admin/grant`.
3. Enter `ADMIN_SECRET`, the user's email, and the real VPN subscription/config URL.
4. Submit. The user's `/ru/dashboard` will show active access and the link.

Required production env vars:

- `AUTH_SECRET`
- `ADMIN_SECRET`
- one Redis REST URL/token pair:
  - `KV_REST_API_URL` + `KV_REST_API_TOKEN`, or
  - `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, or
  - `UPSTASH_REDIS_REST_KV_REST_API_URL` + `UPSTASH_REDIS_REST_KV_REST_API_TOKEN`

## Repo layout

```
src/
├── app/[locale]/         # routes — locale-scoped via next-intl
├── app/api/waitlist/     # POST handler
├── components/
│   ├── sections/         # landing acts (ScrollStage, PricingStage, FaqStage, Footer, …)
│   ├── pricing/          # shared pricing primitives (PaymentPills, FeatureCell)
│   └── ui/               # shared atoms (SectionLabel, DividerLabel)
├── i18n/                 # next-intl config + message map
└── lib/                  # pricing rates, email validation, link constants
messages/{ru,en}.json     # ALL user-facing copy lives here — never hardcode strings in components
```

## Conventions

- All user copy goes in `messages/*.json`. Adding a new page or string → add the key, never inline.
- New shared UI atoms → `src/components/ui/`. New domain components → `src/components/{pricing,sections}/`.
- API routes validate input at the boundary via `src/lib/validation.ts`.
- See `CLAUDE.md` for the agent operating contract (working with Claude Code / Codex).
