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

## Telegram sign-in (Step 1)

Sign-in via Telegram bot deep-link. Browser opens `t.me/<bot>?start=<nonce>`,
user taps "confirm" in the bot, our webhook captures the Telegram id,
the browser polls `/api/auth/telegram/claim` and exchanges the nonce
for a session cookie. Invite codes are pre-loaded into Redis via the
Step 0 admin endpoint and consumed on first-time registration.

### Required env vars (production)

- `TELEGRAM_BOT_TOKEN` — the bot's API token from BotFather. (Already used by the waitlist forwarder.)
- `TELEGRAM_BOT_USERNAME` — the bot's `@username` without the `@`, e.g. `prsloy_bot`. Used to build the deep-link the browser opens.
- `TELEGRAM_WEBHOOK_SECRET` — opaque random string (≥32 bytes). Passed to Telegram via `setWebhook` as `secret_token`. Telegram forwards it on every update via `X-Telegram-Bot-Api-Secret-Token`; we reject anything else.

Without all three, the `/login` and `/register` pages hide the Telegram
button and the three `/api/auth/telegram/*` routes return 503 / 404.

### Wiring the webhook (one-time setup)

```bash
BOT_TOKEN="<prod token>"
WEBHOOK_SECRET="<TELEGRAM_WEBHOOK_SECRET>"
SITE="https://prsloy.online"

curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${SITE}/api/auth/telegram/webhook" \
  -d "secret_token=${WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\"]"
```

`allowed_updates=["message"]` keeps Telegram from forwarding callback
queries, edited messages, photos — anything we don't act on.

### Dev workflow

Telegram's webhook **must reach a public HTTPS URL**, so localhost
alone will not work. The clean pattern: a separate `@prsloy_dev_bot`
plus a tunnel, so the production bot's webhook setting is never
touched.

1. In BotFather: `/newbot` → `@prsloy_dev_bot`, copy the token.
2. Start a tunnel to `localhost:3000`. Either:
   - `ngrok http 3000` (paid tier gives a stable subdomain; free tier
     gives a new URL each session, which means re-running `setWebhook`),
     or
   - `cloudflared tunnel --url http://localhost:3000`.
3. Put the dev secrets in `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=<dev bot token>
   TELEGRAM_BOT_USERNAME=prsloy_dev_bot
   TELEGRAM_WEBHOOK_SECRET=any-long-random-string
   ```
4. Point the dev bot's webhook at the tunnel:
   ```bash
   curl -s "https://api.telegram.org/bot${DEV_BOT_TOKEN}/setWebhook" \
     -d "url=https://<your-tunnel>.ngrok.app/api/auth/telegram/webhook" \
     -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
   ```
5. `npm run dev`, open `/register`, tap the Telegram button. The bot
   should DM with `/start <nonce>`; tapping "confirm" releases the
   polling loop on the page.

### Pre-loading invite codes

Codes live in Redis under `access:pool:reserved` (a Redis SET). The
admin endpoint adds in batches and `ADMIN_SECRET` gates it.

```bash
curl -X POST https://prsloy.online/api/admin/access-pool/add \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"codes":["alpha-001","alpha-002","alpha-003"]}'
# → {"ok":true,"added":3,"skipped":0}
```

Codes must match `[A-Za-z0-9_-]+` and be ≤ 128 chars. Already-present
or already-consumed codes count as `skipped`, not `added`.

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
