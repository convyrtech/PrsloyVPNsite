# PRSLOY — 6-day plan (2026-05-12 → 2026-05-17)

**Scope (one sentence):** finish the Next site so it ships production-ready — honest copy, no placeholders, **a finished `/pricing` page with the checkout UI fully built but the payment provider not yet wired** (waiting on partner's Rollypay approval / dashboard, which lands "на днях").

Backend hardening, auto-route, and live checkout integration are out of scope this week. They get written up as **plan documents only** on Day 1. Live checkout = ~1 day of work after Rollypay credentials land; the page is built so that integration is purely additive.

**On payments this week**:
- `/pricing` looks like a working purchase page: one tier, $5/mo, one method (USDT-TRC20), a real `Купить · $5` button.
- Buy button opens a small modal: "Оплата запускается на днях. Оставь email — пришлём ссылку первому в очереди." Email captured into a simple leads table (Vercel KV or a Google Sheet via API). No Telegram round-trip, no "DM us".
- All checkout machinery (invoice creator, webhook handler, success page, Marzneshin auto-provisioning) is **NOT** built this week. We don't pick a processor yet — that's Rollypay-or-fallback on the day the partner confirms.

**Prereqs the founder must have before Day 1**:
- Decision: leads collection target — Vercel KV / simple Postgres table / Google Sheet via service account. Pick the cheapest, change later.
- Vercel project env access for the new `LEADS_*` secrets.
- Nothing else this week. Rollypay integration is a separate ~1-day sprint when the provider is ready.

## Locked offer

```
PRSLOY is a private routing layer.
One key for trusted clients. Works with Happ.
We test the route on your network. You just connect.
```

```
PRSLOY — приватный routing layer.
Один ключ. Совместим с Happ.
Маршрут под твою сеть тестируем мы. Тебе остаётся подключиться.
```

Copy rules everywhere: no "12 стран", no "99.97%", no "военное", no "без логов", no "без лимита", no "обход блокировок". Honest beta voice. The whole differentiator is "we do the route work for trusted clients."

## Definition of done (must all be true by EOD 2026-05-17)

- Every visible string is either the locked offer, real data, or a beta caveat with a real date.
- Zero "COMING SOON" routes. Every nav link goes somewhere real.
- Mobile-narrow viewport renders without overlap on `/`, `/pricing`, `/faq`, `/setup`.
- `next build` + `next start` is green; site deployed to Vercel under the existing `prsloy` project.
- A non-dev friend on a phone can read it top to bottom, understand the product, hit Buy, and leave their email without confusion.
- `/pricing` Buy button captures email into a real leads store and shows confirmation — verified end-to-end on prod.
- Three background docs exist: `docs/audit/partner-infra.md`, `docs/audit/prod-5k-plan.md`, `docs/audit/rollypay-integration-plan.md` (the 1-day sprint we'll run once partner confirms Rollypay).

## Day 1 — 2026-05-12 — Audit doc + 5k plan doc + lock copy decisions

This is a **writing day**, not a coding day. Goal: get the audit out of the way so days 2–6 are pure site work.

Tasks:
- `docs/audit/partner-infra.md` (~2 pages): what stack actually is, where the bodies are buried. Pull from existing `findings.md` and `_audit/not_for_all/` reading. Honest, blame-free.
- `docs/audit/prod-5k-plan.md` (~2 pages): the 10 blockers (B1–B10) with severity, owner (us / partner / defer), and ETA. **Plan only, no code.** This is what the founder hands the partner before Tranche 2.
- `docs/audit/rollypay-integration-plan.md` (~1 page): the 1-day implementation sprint to wire Rollypay once the partner's account is approved — invoice creation API route, signed webhook handler, `/success` page, Marzneshin user provisioning. Pre-written so we ship the day the credentials arrive, not a week after.
- Final copy pass in `messages/en.json` + `messages/ru.json` as a working draft. Hero, header, sections, footer. Not yet wired to site components.
- Decide three things in writing:
  - Pricing tier — single `$5/mo` or also `$12/3mo`? Single is simpler, ship single.
  - `/dashboard` — do we build it this week or hide the nav link? Hide it this week unless TG WebApp auth is already working in our fork.
  - `/blog` — kill the nav link, no time.

Output: 3 docs. Header nav narrowed to `PRICING · FAQ · SETUP · BUY $5`.

### Background notes for the two audit docs

Pulled from concrete reads of `_audit/not_for_all` so we don't re-discover next week:

- Stack: FastAPI `backend/main.py` (696 lines) on `/api/v5`, aiogram bot `bot.py` (1480 lines) sharing `backend/` via sys.path, Marzneshin panel + chained inbounds for `RU entry → foreign exit`, PostgreSQL, nginx + systemd timers.
- There is **no balancer**. Just three watchdogs: `hellcat-chain-watchdog.sh` (auto-disable hosts whose bridge is dead), `hellcat-e2e-probe.sh` (60s VLESS+Reality canary), `hellcat-node-monitor.sh` (SSH-poll marznode containers). 8 nodes hardcoded in `hellcat-node-monitor.sh`.
- Routing is static: Marzneshin host config picks the chain, client gets one sub link, no per-user / per-ASN selection.
- 5k blockers (B1–B10):
  - B1. Per-username asyncio lock in `backend/marz.py:37` is in-process — fails under `--workers > 1`. File comment already flags this.
  - B2. All caches in `marz.py` are process-memory. Restart = thundering herd onto Marzneshin.
  - B3. Marzneshin is a single-instance control plane.
  - B4. Shortlink shim (`scripts/hellcat-shortlink.py`, port 8001) also single-instance.
  - B5. No queue — payment, extend, reminders are all synchronous or systemd-timer driven.
  - B6. Alembic broken: README says `alembic upgrade head`, no `alembic.ini` in repo. Migrations are raw SQL in `migrations/001_initial.sql`.
  - B7. No automated tests. Only ops shell probes.
  - B8. No rate limiting on `/api/v5/auth/me` (TG initData entry).
  - B9. `routes/user_routes.py` returns `subscriptionUrl=/sub/<slug>` but UI/nginx actually serves the working link at `/s/<slug>`. The site cannot trust the API field today.
  - B10. Hardcoded `/opt/hellcat-app`, `/var/lib/hellcat`, admin chat `627821146`, support handle `@hellcat_vpn_bot`, domain `cloudasset-dl.com` strewn across code, nginx, systemd, scripts.

The audit doc states these as facts. The 5k plan doc orders them by what blocks scale first (B1, B6, B9 are top) and says who fixes each. **Nothing here is built this week.**

## Day 2 — 2026-05-13 — Copy rewrite wired into the site

Goal: every visible string on `/` (the long landing) is the new honest copy. Cyrillic overflow gone.

Tasks:
- Wire the Day-1 `messages/{ru,en}.json` draft into `src/components/sections/*`. Each section's copy comes from `next-intl`, no hardcoded strings.
- Strip every claim flagged in `findings.md:73`: "12 СТРАН", "142 ЖИВЫХ", "99.97%", "ВСЕ СИСТЕМЫ В НОРМЕ", "БЕЗ ЛОГОВ", "БЕЗ ЛИМИТА", "ВОЕННОЕ", auto-rotation.
- Hero replaced by the locked offer. Status strip becomes "BETA · ROUTES UPDATED DAILY" or similar — no fake green dot.
- Globe / footer city list: real exits only. Pull node names from `hellcat-node-monitor.sh` (`MSK · DE · BG · US`). No invented cities.
- Fix narrow-viewport overlap on hero (particle PRSLOY + headline + sub + buy pill all stack at <768px per `findings.md:64`). Either reduce particle scale on small screens or hide particles and lead with text.

Verification: side-by-side screenshot in `preview/copy-rewrite-{before,after}-{1920,375}.png`. Walk through it on phone before merging.

## Day 3 — 2026-05-14 — `/pricing` real page + email-capture Buy button

Goal: kill `[ PRICING · COMING SOON ]` on both locales. The Buy button works — it just doesn't take payment yet. It captures leads while we wait for Rollypay.

Tasks:
- Single tier: `$5 / month · USDT-TRC20`. One price, one method visible, no comparison table, no annual gimmick. The page is built so that swapping the email modal for a real invoice creation is a one-file change later.
- Replace the existing `PricingStage.tsx` payment-pill UI with a single primary `Купить · $5` / `Buy · $5` button. The three crypto-method pills become read-only indicators ("USDT-TRC20 · BTC и XMR скоро") — no click handlers.
- Buy button opens a modal:
  - Headline: "Оплата запускается на днях" / "Payments going live shortly"
  - Sub: "Оставь email — пришлём ссылку первому, кто оплатит. Без спама." / English equivalent
  - Email field + submit. Posts to `src/app/api/leads/route.ts`.
  - On success: "Готово. Напишем как только запустим." Modal stays open showing confirmation, doesn't redirect anywhere.
- API route `src/app/api/leads/route.ts`:
  - Validates email shape.
  - Idempotent: same email twice = same row (return 200, not 409).
  - Writes `{email, created_at, locale, source:'pricing'}` to the leads store decided on Day 1.
  - Rate-limited per IP (say 5/min) to keep dumb bots out.
- Refund/billing line: "7-day refund · ключ выдаётся сразу после оплаты". Real text describing the *future* flow honestly. One sentence.
- Both locales. RU first.

Explicit non-tasks today: no invoice creation, no webhook handler, no Marzneshin call, no `/success` page, no payment processor SDK. **All of that lives in `rollypay-integration-plan.md` and ships on a future day, not this week.**

Verification: open `/ru/pricing` and `/en/pricing` on phone + desktop. Buy → modal opens → submit email → see confirmation. Check the leads store actually got the row. Submit the same email twice → still one row.

## Day 4 — 2026-05-15 — `/faq` and `/setup`

Goal: the two pages that actually carry the offer's "for trusted clients, just connect" promise.

`/faq` — 6–8 questions, no marketing fluff:
- How is this different from a normal VPN? → routing-layer answer in 3 sentences.
- Why Happ specifically? → because we test the route there. Other clients work but we don't QA them daily.
- What do you log? → email if you left one, slug, expire date, used_traffic from Marzneshin. Honest list, no fake "zero logs".
- How do I pay? → "USDT-TRC20. Оплата запускается на днях — оставь email на странице тарифа, пришлём ссылку первым." Other methods later.
- Why no app yet? → trusted-client phase; native app comes after we close paying users.
- What happens if the route dies? → we rotate, you keep one key, no action needed (this is the actual differentiator, not "12 стран").
- Refund? → 7 days after payments go live.
- Когда оплата? → "В течение недели после того как процессор подтвердит аккаунт. Емейл-лист в порядке очереди." Honest.

`/setup` — three-step page:
- 1. Install Happ from store (links: App Store, Play, F-Droid).
- 2. Tap your key link → "Add to Happ" / paste into Happ.
- 3. Connect. If it stalls, hit `Rotate` in bot.

Real screenshots of Happ. No invented UI.

Verification: phone-tested by a friend who has never used VPN before. They install Happ from store, paste a dummy key link, and reach the "connect" screen without asking us a question.

## Day 5 — 2026-05-16 — Legal stubs, header/status cleanup, build green

Goal: every remaining placeholder removed. The site has no dead clicks and `next build` is green.

Tasks:
- `/privacy` — one honest paragraph. What we store (email if you submitted it, slug, expire date, used_traffic), what we don't, where we're based, how to contact. No 10-page boilerplate.
- `/terms` — one honest paragraph. $5/mo, 7-day refund after payment goes live, who we are, ToS-style minimum. No fake legalese.
- `/dashboard` — hide nav link entirely. Route returns 404 cleanly.
- `/blog` — hide nav link entirely. Route returns 404 cleanly.
- Header: kill the fake "ВСЕ СИСТЕМЫ В НОРМЕ" green light. Replace with the current static beta strip ("BETA · ROUTES UPDATED DAILY") or nothing. No fake health indicator until we have a real health source.
- Pass a single `next build` + `next start` on a clean checkout. No console errors, no missing-translation warnings, no unused next-intl keys on `/`, `/pricing`, `/faq`, `/setup`, `/privacy`, `/terms`.
- Trial Vercel preview deploy. If anything breaks (env vars, leads route, image imports), fix today, not Day 6.

Verification: every URL listed in `findings.md` placeholders section either returns real content or 404s cleanly. `next build` exits 0. Vercel preview URL loads on phone and desktop.

## Day 6 — 2026-05-17 — Polish, screenshots, prod deploy

Goal: investor-grade landing live on prod. Pricing page works as a lead funnel until Rollypay lands.

Tasks:
- Vercel production deploy. Confirm the public URL serves the new build with all env vars wired.
- Verify leads route on prod: submit a test email → check it lands in the leads store.
- Screenshot pass at 1920×1080 and 375×667 (iPhone SE width):
  - `/` hero
  - `/` mid-scroll (globe / nothing / pricing emergence)
  - `/pricing` (with the email-capture modal open as second shot)
  - `/faq`
  - `/setup`
  - `/privacy`, `/terms` (one shot each, narrow only)
  Save into `preview/2026-05-17-final/`.
- 60-second screen capture for investor demo: phone, real ISP. Open `/`, scroll through the whole story (hero → globe → pricing → faq), hit Buy, leave email, see confirmation. No payment, just the experience. This is the artifact partner sends investors **today**.
- Last-pass diff: open the site in incognito on a phone you've never used for dev. Read everything top to bottom. Anything that reads like marketing fluff, cut.

Verification: a person who has never seen PRSLOY can land on `/`, understand the offer, leave their email, and screenshot the FAQ in under 2 minutes. No dead clicks, no "COMING SOON", no fake claims.

After this week: when partner confirms Rollypay credentials, run the `docs/audit/rollypay-integration-plan.md` 1-day sprint — swap the email-modal Buy action for invoice creation, add `/success` page, wire Marzneshin user provisioning. Site shell does not change.

## What we are not doing this week

- **Live payment integration.** No Rollypay / CryptoCloud / Plisio wiring, no invoice creation, no webhook handler, no `/success` page, no Marzneshin auto-provisioning. All of it is one pre-written 1-day sprint in `docs/audit/rollypay-integration-plan.md`, runs when partner confirms Rollypay credentials.
- Multiple payment methods. One method (USDT-TRC20) is what we'll start with when payments go live. BTC / XMR / Stars come after.
- Auto-route MVP (`PRSLOY AUTO` / `PRSLOY BACKUP` chain selector). Stays as plan in `docs/audit/prod-5k-plan.md`, not built.
- Patches to partner's `not_for_all`. Zero pushes there. Zero edits to partner systemd / nginx / panel.
- Multi-worker safety, Alembic baseline, queue, rate limiting — all live in the 5k plan doc, none ship.
- `/dashboard` with renewal / usage stats. Tranche 2.
- Own mobile app — roadmap copy only.
- Direct founder ↔ teen investor contact (per `feedback_no_direct_investor_contact.md`). Partner delivers the artifacts produced this week.

## Risk register

- R1. Day 1 audit docs balloon and eat Day 2. Mitigation: hard half-day timebox; bullets, not prose.
- R2. Rollypay doesn't approve in any reasonable window. Mitigation: site already collects emails on Day 3, so the lead funnel keeps working regardless of processor timing. If Rollypay stalls beyond 2 weeks, run the same 1-day sprint against CryptoCloud or Plisio — same plan, different SDK.
- R3. Visitors leave the email modal feeling "это всё?". Mitigation: confirmation copy promises a real timeline ("в течение недели после подтверждения процессора") rather than vague "скоро". If we ship and conversion-to-email is bad, A/B with a more concrete date once we have it.
- R4. Partner reads site-driven email list as "they're building their own funnel separate from mine". Mitigation: Day 6 status note explicitly says "list is shared, every paid user lands on your Marzneshin panel". This is true and worth saying upfront.
- R5. Investor #1 keeps slipping during the week. Mitigation: Day 6 walkthrough video (no payment, just the experience) is partner's ammunition. Founder does not contact investor directly.
- R6. We polish the site for 6 days and the offer copy turns out wrong on day 7. Mitigation: Day 1 nails the copy in writing first, Day 2 wires it; if the offer changes after, it's a 1-file edit because all strings come from `messages/*.json`.

---

## Original draft (preserved verbatim)

### Phase 1: Site And Copy

Goal: make PRSLOY look like a live client product, not a visual demo.

- Rewrite EN/RU copy from scratch.
- Fix Russian text so layout does not break.
- Replace `/pricing` placeholder with a real pricing page.
- Add clear CTA from site to purchase/support flow.
- Add setup flow: get key -> install client -> import profile -> connect.
- Add "Works with Happ / Hiddify / NekoBox".
- Add honest status/changelog instead of fake metrics.
- Remove weak or risky claims: huge node counts, fake uptime, unlimited promises, direct block-bypass wording.

Core message:

```txt
Access without the maintenance.
One key. Working routes. No server hunting.
```

### Phase 2: PRSLOY Auto Route

Goal: user should not manually test servers in Happ. PRSLOY should choose the best working chain.

Current infra model:

```txt
client -> RU entry / bridge -> foreign exit -> internet
```

So we select the best route chain, not just the best standalone server.

What to test:

- Browser/site tests `client -> RU entry`:
  - latency;
  - timeout;
  - availability;
  - small download.
- Backend monitoring tests `RU entry -> foreign exit`:
  - chain health;
  - latency;
  - throughput;
  - dead/blocked exits.

MVP scoring:

```txt
score = client_entry_latency * 0.6
      + entry_exit_latency * 0.2
      + failure_rate * 0.2
```

Subscription output:

```txt
PRSLOY AUTO
PRSLOY BACKUP
```

No long server list for the client. Dead chains are not returned. Best chain for the user's provider/ASN goes first, fallback second.

Backend data to store:

```txt
asn
isp
region
ru_entry_id
exit_id
chain_id
latency
success_rate
last_seen
```

Short version:

```txt
Site finds which RU entry is best for the user's network.
Backend knows which foreign exit works best behind that entry.
Subscription returns the best ready-to-use chain.
```
