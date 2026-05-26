# PRSLOY

Invite-only VPN. This repo ships the public site, the customer cabinet, the operator admin panel, and the analytics loop that backs them. Beta.

Stack: Next.js 15 (App Router) · React 19 · TypeScript 5.7 (strict) · Tailwind 3.4 · next-intl 3.26 (RU/EN) · Upstash Redis (REST) · Resend (email) · `motion` 11 · `three` 0.172. Deployed manually on Vercel via `vercel --prod`.

## Routes

Public:

| Path | What it is |
|---|---|
| `/` (`/ru`, `/en`) | Landing — hero → handshake → 3D globe → "your ISP sees nothing" → pricing → FAQ → footer |
| `/pricing` | Period switcher (1/6/12 mo), SBP + USDT checkout, public slot counter, invite-request panel |
| `/faq` | Product / tech / payment / privacy |
| `/privacy` · `/terms` · `/refunds` | Legal pages |
| `/setup` | Per-device setup guide for Happ |
| `/blog` | Devlog — what shipped, what's next |
| `/login` · `/register` | Email + password OR Telegram one-tap (deep-link bot flow) |
| `/dashboard` | Connection panel — access state, key, reissue, support |

Operator (gated by `ADMIN_SECRET`):

| Path | What it is |
|---|---|
| `/admin/users` | Account list + delete + reissue queue |
| `/admin/grant` | Hand a key (subscription URL) to an account by identifier (email / `@username` / numeric Telegram id) |
| `/admin/analytics` | Pageviews, UTM sources, funnel, payment methods, revenue — live from KV |

API:

| Path | What it is |
|---|---|
| `POST /api/auth/register` · `/login` · `/logout` · `/me` · `/verify` · `/resend-verification` | Email/password flow |
| `POST /api/auth/telegram/init` · `/claim` · `/webhook` | Telegram deep-link sign-in |
| `POST /api/payments/platega/create` · `/callback` | SBP / USDT checkout + provider webhook |
| `GET /api/payments/me` | Latest order for the current session |
| `POST /api/access/reissue` · `/api/access/request-via-email` | Customer reissue + invite-by-email |
| `GET /api/access/capacity` · `POST /api/access/notify-when-open` | Public slot counter + pool-full waitlist |
| `POST /api/track` | First-party pageview beacon |
| `POST /api/admin/grant` · `/api/admin/access-pool/add` · `/api/admin/users` · `/api/admin/reissue` · `GET /api/admin/analytics` | Admin endpoints (Bearer ADMIN_SECRET) |
| `POST /api/waitlist` | Pre-launch email capture (legacy) |

## Local dev

```bash
npm install
npm run dev        # Turbopack on http://localhost:3000 (Windows: may fall back to next start)
npm test           # vitest — 273 tests, must stay green
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
npm run build      # production build — must stay green
```

## Required production env vars

Auth + storage:

- `AUTH_SECRET` (≥ 32 chars)
- `ADMIN_SECRET`
- One Redis REST pair: `KV_REST_API_URL` + `KV_REST_API_TOKEN`, **or** `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, **or** the `UPSTASH_REDIS_REST_KV_REST_API_*` aliases.

Email (Resend):

- `RESEND_API_KEY` + `RESEND_FROM` — verification emails, reissue notifications, invite delivery. Without them email send is silently skipped (calls return `{ok: false, skipped: true}`).

Payments (Platega):

- `PLATEGA_MERCHANT_ID` + `PLATEGA_SECRET` — checkout creation + webhook auth. Method ids default to SBP=2, Crypto/USDT=13; override via `PLATEGA_SBP_PAYMENT_METHOD_ID` / `PLATEGA_CRYPTO_PAYMENT_METHOD_ID` if needed.

Telegram bot (auth + notifications):

- `TELEGRAM_BOT_TOKEN` — from BotFather.
- `TELEGRAM_BOT_USERNAME` — without the `@`.
- `TELEGRAM_WEBHOOK_SECRET` — opaque ≥ 32-char random; passed to `setWebhook` as `secret_token` and required on every update.
- `TELEGRAM_NOTIFY_CHAT_ID` (optional) — waitlist signups forwarded here.

Site:

- `NEXT_PUBLIC_SITE_URL` — canonical / OG base URL.

## Telegram sign-in

Browser opens `t.me/<bot>?start=<nonce>` from `/login` or `/register`. User taps confirm in the bot; webhook captures the Telegram id; the page polls `/api/auth/telegram/claim` and exchanges the nonce for a session. First-time registration consumes one invite code; returning users sign in free.

One-time webhook wiring:

```bash
BOT_TOKEN="<prod token>"
WEBHOOK_SECRET="<TELEGRAM_WEBHOOK_SECRET>"
SITE="https://prsloy.online"

curl -s "https://api.telegram.org/bot${BOT_TOKEN}/setWebhook" \
  -d "url=${SITE}/api/auth/telegram/webhook" \
  -d "secret_token=${WEBHOOK_SECRET}" \
  -d "allowed_updates=[\"message\"]"
```

The bot recognises `/start <nonce>` (auth), bare `/start` (welcome DM), and `/invite` (auto-generates a code and DMs a magic link, rate-limited per Telegram id).

### Dev workflow

Telegram's webhook needs a public HTTPS URL — keep a separate `@prsloy_dev_bot` so the prod webhook is never touched.

1. BotFather → `/newbot` → copy dev token.
2. Tunnel localhost: `cloudflared tunnel --url http://localhost:3000` (or `ngrok http 3000`).
3. `.env.local`:
   ```
   TELEGRAM_BOT_TOKEN=<dev bot token>
   TELEGRAM_BOT_USERNAME=prsloy_dev_bot
   TELEGRAM_WEBHOOK_SECRET=any-long-random-string
   ```
4. Point dev bot at the tunnel:
   ```bash
   curl -s "https://api.telegram.org/bot${DEV_BOT_TOKEN}/setWebhook" \
     -d "url=https://<your-tunnel>/api/auth/telegram/webhook" \
     -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}"
   ```
5. `npm run dev`, open `/register`, tap the Telegram button.

## Invite codes

Codes live in Redis under the `access:pool:reserved` SET. The bot's `/invite` command auto-generates one per Telegram user (XXXX-XXXX format, rate-limited). Operators can also pre-seed in bulk:

```bash
curl -X POST https://prsloy.online/api/admin/access-pool/add \
  -H "Authorization: Bearer $ADMIN_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"codes":["alpha-001","alpha-002","alpha-003"]}'
# → {"ok":true,"added":3,"skipped":0}
```

Codes match `[A-Za-z0-9_-]+`, max 128 chars. Already-present or already-consumed codes count as `skipped`.

## Manual VPN grant

VPN-panel provisioning is not yet automated (`NEXT — AUTO KEY DELIVERY` on the devlog). After a successful payment the access key is still issued by the operator:

1. Create the subscription/config URL in the VPN panel.
2. Open `/ru/admin/grant`.
3. Enter `ADMIN_SECRET`, an identifier (email / `@username` / Telegram id), and the subscription URL.
4. Submit. The user's `/ru/dashboard` shows active access and the link.

## Analytics

First-party counters on Redis — no third-party SDKs, no tracking cookies. `src/lib/analytics.ts` exposes a typed `track()` for server events; the client-side beacon (`src/components/analytics/Beacon.tsx` + `/api/track`) records pageviews via `fetch` after navigation. Counters are env-prefixed (`prod` / `preview` / `dev`) so local development never pollutes production data.

Operator dashboard at `/[locale]/admin/analytics` reads aggregates back via batched `MGET` against a per-day key index. Day-total revenue counted exactly once per payment via NX gate on `payment:emit:{orderId}`.

## Repo layout

```
src/
├── app/[locale]/         # routes — locale-scoped via next-intl
│   ├── admin/            # operator pages (gated client-side by ADMIN_SECRET)
│   ├── login/ register/  # email + Telegram sign-in pages
│   ├── dashboard/        # customer connection panel
│   └── pricing/ blog/ …  # public pages
├── app/api/              # route handlers (auth, payments, admin, track, …)
├── components/
│   ├── sections/         # landing acts
│   ├── pricing/          # pricing primitives
│   ├── payments/         # checkout + status
│   ├── auth/             # forms, Telegram button, dashboard client
│   ├── admin/            # operator clients
│   ├── analytics/        # Beacon (client)
│   └── ui/               # shared atoms (SectionLabel, RevealOnView, DotoNumber)
├── i18n/                 # next-intl config + routing
└── lib/                  # business logic (auth, payments, platega, telegram-auth,
                          # analytics, capacity, access-pool, kv, rate-limit, …)
messages/{ru,en}.json     # ALL user-facing copy — never hardcode strings in components
```

## Conventions

- All user copy goes in `messages/*.json`. RU and EN MUST be updated in lockstep — adding a key in one without the other is a bug.
- New shared UI atoms → `src/components/ui/`. New domain components → `src/components/{sections,pricing,payments,auth,admin}/`.
- API routes validate input at the boundary (`src/lib/validation.ts`, typed error classes like `AuthError`, `PaymentError`).
- All analytics events go through the typed discriminated union in `src/lib/analytics.ts` — typos fail the build, not the funnel.
- Tests live under `src/lib/__tests__/` (vitest, fake-redis substrate). 100% on touched code.
- Deploy is **manual** via `vercel --prod`. No GitHub Actions, no auto-deploy on merge.
- See `CLAUDE.md` / `AGENTS.md` for the agent operating contract (Claude Code / Codex).
- `CONTEXT.md` for domain terms (Order ≠ Subscription ≠ Key ≠ Transaction).
