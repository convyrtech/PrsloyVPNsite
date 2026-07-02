# PRSLOY pre-flight check

Reusable methodology + first-run findings. Run this **before every `vercel --prod` and before pointing ads at any route.** Audits are SOURCE-BASED first (prod sits behind a Vercel WAF that intermittently blocks automated browsers; dev lacks KV/auth/payment so some states can't be reached there). For each route×state below, the **how to reach** column tells a human verifier exactly how to get eyes on it.

---

## Pre-flight check — how to run it

### 1) Automated gate (must be green before anything else)

Run from repo root. Any red here blocks the deploy.

```bash
npm run typecheck          # TS strict — zero errors
npm run lint               # clean, or note known-failing lines
npm test                   # full vitest suite
npm run build              # must stay green before vercel --prod
```

i18n parity (Hook 1 enforces this on commit, but verify manually when touching copy):
- Every key added/changed in `messages/ru.json` has a matching key in `messages/en.json` (and vice versa). Brand-only literals (`"PRSLOY"`) exempt.
- Inline-COPY components (`blog/page.tsx` hardcodes both locales — the i18n hook does **not** catch drift there) must have EN + RU present in the file.

Then the **curl smoke-script** (see *Harness to build* §D for the full script):
```bash
bash scripts/smoke.sh http://localhost:3000          # trustworthy gate — no WAF
bash scripts/smoke.sh https://www.prsloy.online      # best-effort — WAF-CHALLENGE is expected, not a failure
```
The dev run is the gate. The prod run is best-effort: a `WAF-CHALLENGE` exit (2) means "bot blocked", **not** "site down" — distinguish the two before panicking.

### 2) State-forcing for visual check

Most hard states are not reachable by just visiting a URL. Use the reachability harness:
- **`query-flag`** states — visit directly, no setup. Payment banners: `…/pricing?payment=success`, `…/pricing?payment=failed`, `…/dashboard?payment=success`.
- **`dev-url`** states — `npm run dev`, then visit. Guest paths, client-side validation errors (bad-email regex), dashboard `no-user`/`loading`.
- **`needs-auth` / `needs-kv` / `needs-payment`** states — require the `?__state=` / `?__error=` dev overrides (build them per §D) **or** a seeded KV user on a preview deploy. Until the overrides land, these are reached only by real auth/payment or admin curls.
- **`source-only`** states — not browser-reachable without crafted KV (timer-expired pool, expired/hidden payment strips, error boundaries). Verify by reading the branch + its copy.

### 3) Manual mobile pass at 375px (down the funnel)

Resize to **375×812** (iPhone X-ish) and walk the real funnel in order: `/` → `/pricing` → `/login` or `/register` → `/dashboard` → `/setup`. At each stop check:
- The **primary CTA is above the fold** (no scrolling to reach the one action we want next). Known offenders: the oversized pricing price block and the dashboard verify-panel-above-hero stack push the primary under the fold.
- **Touch targets ≥ 44px in both axes.** Known offenders: banner dismiss ✕, auth cross-links (44px tall but ~40px wide), admin KeyReveal show/copy (36px).
- **No dead ends** — every state has a forward action or a clear next step (support link counts).

### 4) Button-prominence eyeball

On every screen-state, count the solid-white pills (`bg-text-display text-black rounded-full`). **There must be exactly one tier-1 per viewport, and it must be the action we want next.** The rubric and the known violations are in §C and §E. The persistent Header BUY pill is the repeat offender — it adds a second white pill on nearly every route.

---

## Route × State coverage matrix

This table **is** the coverage checklist. Tier = the page's intended primary tier (white pill = tier-1).

| Route | State | Primary action | Tier | How to reach |
|---|---|---|---|---|
| `/` (home) | static / scroll-driven | Scroll to pricing / get-access CTA | unclear | prod-url |
| `/pricing` | guest | Create PRSLOY ID (→ /register) | tier-1 | prod-url |
| `/pricing` | authed · email linked | Pay with SBP | tier-1 | query-flag (`?__state=authed`) |
| `/pricing` | authed · no email (TG-only) | Link email for receipts | tier-1 | query-flag (`?__state=authed-noemail`) |
| `/pricing` | payment=success banner | Dismiss / proceed (informational) | none | query-flag |
| `/pricing` | payment=failed banner | Retry (checkout below for authed) | none | query-flag |
| `/login` | guest (default) | Sign in (submit) | tier-1 | prod-url |
| `/login` | already-authed → redirect | (server redirect) | none | needs-auth |
| `/login` | auth-setup-error → error boundary | (global error page) | none | source-only |
| `/login` | +telegram block | Email submit OR Telegram login | tier-1 | needs-kv |
| `/login` | AuthForm submitting | Wait (disabled) | tier-1 | needs-auth |
| `/login` | error: invalid_credentials | Fix credentials, resubmit | tier-1 | needs-auth |
| `/login` | error: client-invalid email | Correct email | tier-1 | dev-url |
| `/login` | Telegram: awaiting confirm | Confirm in bot; reopen link | tier-1 | needs-kv |
| `/login` | Telegram: error | Restart Telegram flow | tier-1 | needs-kv |
| `/register` | guest (default) | Create account (submit) | tier-1 | prod-url |
| `/register` | error: client-invalid email/password | Correct input | tier-1 | dev-url |
| `/register` | error: email_exists | Use login / different email | tier-1 | needs-kv |
| `/register` | success → dashboard?registered=1 | (navigates to dashboard) | none | needs-kv |
| `/register` | +telegram register block | Email register OR Telegram register | tier-1 | needs-kv |
| `/dashboard` | loading | Wait | none | dev-url |
| `/dashboard` | not_configured | None (warning panel) | none | source-only |
| `/dashboard` | guest (no user) | Sign in | tier-1 | dev-url |
| `/dashboard` | authed · pending-unpaid | Pay (go to pricing) | tier-1 | needs-auth |
| `/dashboard` | authed · paid-awaiting-issue | Wait for key issuance — support only | tier-2 | query-flag (`?__state=paid-awaiting`) |
| `/dashboard` | authed · issue-failed (paid, auto-issue failed) | Wait — operator issues manually; support | tier-2 | query-flag (`?__state=issue-failed`) |
| `/dashboard` | authed · active (has key) | Set up the key (→ /setup) | tier-1 | needs-payment |
| `/dashboard` | authed · blocked | Contact support | tier-2 | needs-kv |
| `/dashboard` | authed · email-unverified | Resend verification email | tier-2 | needs-kv |
| `/dashboard` | KeyBlock · copy-done/error/revealed | Copy key / reveal URL | tier-1 | needs-payment |
| `/dashboard` | PaymentStatusCard: loading | Wait | none | needs-auth |
| `/dashboard` | PaymentStatusCard: empty (no order) | Pay (→ pricing) | tier-3 | needs-auth |
| `/dashboard` | PaymentStatusCard: pending/created | Pay (→ pricing) | tier-3 | needs-payment |
| `/dashboard` | PaymentStatusCard: confirmed (active) | None (informational) | none | needs-payment |
| `/dashboard` | PaymentStatusCard: expired | Renew (→ pricing) | tier-3 | source-only |
| `/dashboard` | PaymentStatusCard: hidden (stale terminal) | (strip absent) | none | source-only |
| `/dashboard` | PaymentStatusCard: error | None (retries in poll budget) | none | source-only |
| `/dashboard` | ReissueRow: sent/error/rate_limited/no_key/auth_required | Request key reissue | tier-3 | needs-payment |
| `/dashboard` | payment=success/failed banner | Dismiss; status below is next step | none | query-flag |
| `/setup` | static | Download Happ client | tier-1 | prod-url |
| `/faq` | static | Go to pricing | tier-3 | prod-url |
| `/privacy` | static | Read; contact support | tier-3 | prod-url |
| `/terms` | static | Read; contact support | tier-3 | prod-url |
| `/refunds` | static | Read; contact support | tier-3 | prod-url |
| `/blog` | static (devlog) | See pricing | tier-3 | prod-url |
| `/admin/grant` | not-configured → 404 | (404) | none | source-only |
| `/admin/grant` | configured · secret-not-entered (idle) | Enter secret + identifier, Find | tier-1 | needs-kv |
| `/admin/grant` | searching | Wait (disabled) | tier-1 | needs-kv |
| `/admin/grant` | lookup error (no card) | Fix identifier/secret, retry | tier-1 | needs-kv |
| `/admin/grant` | AccessCard loaded | Issue key (or Extend) | tier-1 | needs-kv |
| `/admin/grant` | AccessCard · issue-locked (no email/blocked) | Unblock first, or manual-attach | tier-2 | needs-kv |
| `/admin/grant` | AccessCard action: issuing/blocking/attaching + flash | Confirm dialog → mutate → refresh | tier-1 | needs-kv |
| `/admin/users` | not-configured → 404 | (404) | none | source-only |
| `/admin/users` | configured · pre-load (secret only) | Enter secret, Load users | tier-1 | needs-kv |
| `/admin/users` | loaded · users + reissue queue | Issue key per-row / mark handled | tier-1 | needs-kv |
| `/admin/users` | reissue row: open vs handled | Grant new then Mark done | tier-1 | needs-kv |
| `/admin/users` | users-error / reissue-error (partial) | Fix secret/retry | tier-1 | needs-kv |
| `/admin/users` | empty list / no-match | Adjust filter/search | none | needs-kv |
| `/admin/users` | delete-confirm / deleting | Confirm delete | tier-1 | needs-kv |
| `/admin/analytics` | not-configured → 404 | (404) | none | source-only |
| `/admin/analytics` | idle (secret not submitted) | Enter secret, Загрузить | tier-1 | needs-kv |
| `/admin/analytics` | loading | Wait (disabled) | tier-1 | needs-kv |
| `/admin/analytics` | loaded (AggregateView) | Read metrics; change date/env | tier-2 | needs-kv |
| `/admin/analytics` | error (401 / generic / network) | Fix secret, retry | tier-1 | needs-kv |

**70 route×state rows.**

---

## Button-prominence rubric

Tiers, by Tailwind className:

- **TIER-1 PRIMARY** (max prominence): solid white pill — `bg-text-display text-black rounded-full`. **Exactly ONE per viewport/state** ("one moment per screen"), and it MUST be the action we want the user to take next.
- **TIER-2 SECONDARY**: outline pill — `border border-border-visible` + `text-text-display`.
- **TIER-3 TERTIARY**: bare text link — `text-text-display hover:opacity-80`.
- **MUTED**: `text-text-disabled`.

**The one-tier-1 rule.** A screen may show many tier-2/tier-3 affordances, but only one solid-white pill. If two are co-visible, one of them is stealing the moment.

**How to spot violations:**
1. Grep the viewport's components for `bg-text-display` + `text-black` + `rounded-full`. More than one match co-rendered = candidate violation.
2. Check the **persistent Header `BuyCta`** (`Header.tsx:388-404`) — it renders globally and is a white pill `→ /pricing` on *every* route, so it's almost always the silent second tier-1. On `/pricing` it's a no-op self-link.
3. **List contexts are the exception** — `/admin/users` repeats a tier-1 per row; "one moment per screen" doesn't cleanly apply, but the per-row pills should still be demoted to tier-2 so the page-level submit owns the white pill.
4. Two legitimate in-body actions fighting (auth email-submit + Telegram; dashboard setup-hero + copy-key) = pick the true next action, demote the other to tier-2 outline.

---

## Harness to build

Three pieces, in priority order.

### 1) Shared dev-only state override (one choke-point)

Add `src/lib/dev-state.ts` so the prod-inert guard is written once and unit-tested:
```ts
export function getDevState(key: string): string | null {
  if (process.env.NODE_ENV === 'production' || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(key);
}
```
Add `src/lib/__tests__/dev-state.test.ts` asserting it returns `null` when `NODE_ENV==='production'`. Then wire each component's override through it (null short-circuits to the real fetch):

- **`PricingPageClient.tsx`**: `?__state=authed` → signed-in checkout (pay buttons); `?__state=authed-noemail` → the email-link step replaces the pay buttons (Telegram-only account shape). The capacity/pool states are gone with the scarcity storefront (2026-07-02).
- **`DashboardClient.tsx`** (before `fetchMe`): `?__state=` `active` / `blocked` / `unverified` / `pending` / `paid-awaiting` / `issue-failed` / `not_configured`, each setting a `PublicAuthUser` fixture + `setPaidAwaiting`/`setIssueFailed`. `paid-awaiting` and `issue-failed` must show **no** pay CTA (primary='none').
- **`AuthForm.tsx`** (on mount): `?__error=` `email_exists` / `credentials` / `rate_limited` / `storage` / `secret` / `not_configured` / `generic` → `setError(copy[…])`, renders the exact `<p role="alert">` for screenshot without a backend.

### 2) Curl smoke-script

Create `scripts/smoke.sh` (or a `.ps1` mirror for Windows). Hits every locale route on prod+dev, asserts status + a stable text marker, and flags WAF challenges distinctly from outages.

```bash
#!/usr/bin/env bash
# usage: scripts/smoke.sh https://www.prsloy.online   (or http://localhost:3000)
set -u
BASE="${1:?usage: smoke.sh BASE_URL}"
UA='prsloy-smoke/1'
FAIL=0; WAF=0

check () { # $1=path  $2=expected_status  $3=marker (grep -i, empty to skip)
  local path="$1" want="$2" marker="${3:-}"
  local body; body="$(mktemp)"
  local code
  code="$(curl -sS -o "$body" -w '%{http_code}' -A "$UA" "$BASE$path")"
  if grep -Eqi 'Vercel Security Checkpoint|_vercel/security|challenge-platform|Just a moment' "$body"; then
    echo "WAF-CHALLENGE  $path  ($code)"; WAF=1; rm -f "$body"; return
  fi
  if [ "$code" != "$want" ]; then
    echo "FAIL  $path  status=$code want=$want"; FAIL=1; rm -f "$body"; return
  fi
  if [ -n "$marker" ] && ! grep -qi "$marker" "$body"; then
    echo "FAIL  $path  marker missing: $marker"; FAIL=1; rm -f "$body"; return
  fi
  echo "OK    $path  ($code)"
  rm -f "$body"
}

for L in ru en; do
  check "/$L"          200
  check "/$L/pricing"  200 "pricing"
  check "/$L/login"    200
  check "/$L/register" 200
  check "/$L/dashboard" 200 "PRSLOY ID"
  check "/$L/faq"      200
  check "/$L/blog"     200
  check "/$L/privacy"  200
  check "/$L/terms"    200
  check "/$L/refunds"  200
  check "/$L/setup"    200
done
# admin/grant returns 404 when ADMIN_SECRET is unset — assert that, not 200
check "/ru/admin/grant" 404

# public JSON read APIs (guest)
curl -sS -A "$UA" "$BASE/api/auth/me"          | grep -q '"user":null' && echo "OK    /api/auth/me (guest)" || echo "NOTE  /api/auth/me not guest-null"

[ "$WAF" = 1 ] && { echo "— WAF challenge seen (expected on prod, not a failure)"; exit 2; }
[ "$FAIL" = 1 ] && exit 1
echo "all green"; exit 0
```
`localePrefix: 'always'`, so every page is `/{ru|en}/…`. The dev run is the trustworthy gate; on prod a `WAF-CHALLENGE` (exit 2) is an expected non-failure.

### 3) Manual-only states (no cheap lever — document the steps)

- **Populated admin AccessCard** (active/pending/blocked/no-key/no-email) — needs a seeded KV user on a preview: register a test account, then curl `/api/admin/issue` (active+key), `/api/admin/access` PATCH `blocked:true` (blocked), or leave unpaid (pending/keyNone), then re-search the identifier.
- **Admin rate_limited** — fire >10 `/api/admin/capacity-reset` calls in 60s to trip the 429 → "Слишком много действий".
- **`confirmed` payment banner (green)** — needs a real confirmed order in KV; on dev it sticks on `processing` forever. Screenshot `processing`+`failed` on dev, `confirmed` on prod after an `/api/admin/reprocess` run.

---

## First-run findings

Confirmed findings (passed adversarial verification) plus the prominence/reachability sweep. Grouped by severity.

### HIGH

- **Confirmed-payment banner promises a key that isn't there** · `/dashboard` (and `/pricing?payment=success`), payment confirmed / key not yet issued (the typical closed-beta case). `messages/en.json:361` / `ru.json:363` `confirmed_body` = "Subscription active — status and **key below**." rendered by `PaymentResultBanner.tsx:84-87`, but `KeyBlock` only renders when a key exists (`DashboardClient.tsx:224`, `hasKey = Boolean(user.subscriptionUrl)` line 201). A just-confirmed beta user has no key, so the banner contradicts the page beneath it and breaks the Order≠Ключ rule. **Fix:** reword `confirmed_body` to not assert a key is present (e.g. RU "Подписка активна. Статус ниже — ключ появится, когда выдадим доступ."), both locales in lockstep. `success_body` already gets this right.

- **Two competing tier-1 primaries in the auth form** · `/login` and `/register`, default render with Telegram enabled. `AuthForm.tsx:196-199` submit and `TelegramAuthButton.tsx:242-245` are the identical solid-white pill, both inside the same `<section>`. **Fix:** keep email submit tier-1, demote the Telegram button to tier-2 outline (`border border-border-visible text-text-display`, drop `bg-text-display text-black`), `min-h-[48px]`.

- **Header BUY pill is a second tier-1 on every page** · all routes (global layout). `Header.tsx:388-404` white pill `→ /pricing` renders via `layout.tsx:121` on every route, co-visible with each page's own primary. On `/pricing` it's a self-referential no-op next to the real checkout/invite pill (`PaymentCheckout.tsx:134` / `InviteRequest.tsx:135`). **Fix:** demote `BuyCta` to tier-2 outline globally (or at least on routes with their own in-body tier-1: pricing, login, register, dashboard, setup); reserve the white Header pill for routes with no in-body primary (faq, blog, legal).

- **Guest's real primary (Telegram invite pill) sits far below the mobile fold** · `/pricing` guest, 375px. `PricingPageClient.tsx:200-206` renders `pt-[120px]` + label + h1 + subhead + switcher + a `clamp(96px,19vw,200px)` price + counter **before** the `InviteRequest` Telegram pill (`InviteRequest.tsx:130-141`). The giant price alone pushes the only forward CTA off-screen. **Fix:** lower the mobile price clamp floor and/or lift a compact invite CTA adjacent to the price so the pill enters the first viewport.

- **Home hero shows up to three identical white `/pricing` pills at once** · `/`, ACT-1 hero/globe. `Header.tsx:388-404` + `ScrollStage.tsx:164-174` hero CTA + `GlobeUIOverlay.tsx:92-100` desktop overlay CTA — all solid-white, all `→ /pricing`. The overlay already drops its mobile CTA to avoid repetition; desktop + Header still triple up. **Fix:** keep exactly one white `/pricing` pill per scroll state — the hero CTA owns ACT 1; demote Header to tier-2 on home and drop the desktop globe-overlay pill (or cross-fade hero ↔ overlay).

### MEDIUM

- **Paid-awaiting hero reuses unpaid "once your payment is confirmed" copy** · `/dashboard` paid-awaiting-issue. `DashboardClient.tsx:286-304` falls into the `else` branch → `status_pending_body` ("Once your payment is confirmed…"), but the same order renders as **active** in `PaymentStatusCard.tsx:187` directly below. Two-lifecycle contradiction in one viewport. **Fix:** add `status_paid_awaiting_title/body` ("Оплата получена" / "Payment received", body: "Готовим доступ — ключ и кнопки появятся автоматически…") to both locales + `DashboardCopy` + `dashboard/page.tsx` keys, and pick them in `FloatingHero` when `paidAwaiting` before the active/pending fork. No nudge back to checkout.

- **Active dashboard shows two tier-1 pills** · `/dashboard` active. `FloatingHero` setup CTA (`DashboardClient.tsx:324`) and `KeyBlock` copy CTA (`DashboardClient.tsx:398-399`) are both white pills, co-rendered. **Fix:** the freshly-active user's next action is copy-the-key — keep COPY tier-1, demote SETUP GUIDE to tier-2 outline.

- **Payment-result banner dismiss ✕ below 44px** · `/dashboard` / `/pricing` with banner visible. `PaymentResultBanner.tsx:131-139` dismiss has only `px-sm py-xs`, no min-h/min-w → ~24-28px tall. **Fix:** add `min-h-[44px] min-w-[44px] inline-flex items-center justify-center`, glyph size unchanged.

- **Pending pay pill falls below the fold when email-verify panel stacks above the hero** · `/dashboard` pending + unverified, 375px. `DashboardClient.tsx:206-339` stacks the bordered verify panel (~200px) above `FloatingHero`, pushing `pay_cta` (line 331-339) toward/under the 667px fold. **Fix:** render `FloatingHero` before the verify panel, or collapse the verify notice to a single tertiary inline row.

- **Not-configured panel is a dead end** · `/dashboard` not_configured. `DashboardClient.tsx:152-158` body says "message support" but `StatusPanel` gets no children → no support link, no retry. **Fix:** pass an `<a href={TELEGRAM_BOT_URL}>` tertiary child (`copy.support_link`), matching the auth-required panel. `TELEGRAM_BOT_URL` already imported (line 8).

- **Analytics page is hard-coded Russian** · `/admin/analytics`, any state on `/en`. `AdminAnalyticsClient.tsx` ignores `locale` for all copy except `NavTabs` — H1 "Аналитика.", buttons "ЗАГРУЗИТЬ"/"ОБНОВИТЬ", empty/error strings all RU. Grant/Users ship full `COPY: Record<'ru'|'en'>`. **Fix:** add an EN/RU COPY map selected via `getCopy(locale)`; prose + empty-states + errors must be bilingual (code-ish mono table titles may stay).

- **Analytics leaks raw error codes** · `/admin/analytics` error. `AdminAnalyticsClient.tsx:83-88` renders `data.error` verbatim → operator sees literally `kv_not_configured` / `not_found`. Only 401 is mapped. **Fix:** map through an errors dictionary like `AdminUsersClient` (`copy.errors[data.error] || copy.errors.unknown`).

- **Every user/reissue row renders a tier-1 pill** · `/admin/users` loaded. `UserRow` issue-key (`AdminUsersClient.tsx:875-882`) and `ReissueRow` grantNew (`764-772`) are white pills repeated per row → N+M competing tier-1s; destructive Delete sits at near-equal weight. **Fix:** demote per-row issue to tier-2 outline; reserve the white pill for the page-level Load/Reload submit (already tier-1).

- **Destructive delete gives no success feedback** · `/admin/users` after a successful DELETE. `removeUser` (`AdminUsersClient.tsx:421-460`) only filters the row out — no flash, no toast. Operator can't distinguish "deleted" from "scrolled away". **Fix:** add a transient success flash + `deleted` copy (both locales); the `confirm()` guard is fine, the post-action confirmation is missing.

- **SBP pay pill below the mobile fold** · `/pricing` authed, 375px. `PaymentCheckout.tsx:130-140` pay pill renders after the `clamp(96px,19vw,200px)` price + counter. **Fix:** tighten the mobile price clamp floor or pin a compact pay CTA.

- **Active subscriber's Header pill misdirects to buy-again** · `/dashboard` active. In-body primary is setup/copy-key, but the Header white pill `→ /pricing` (`Header.tsx:391`) pulls attention to buying again. **Fix:** demote Header CTA to tier-2 on `/dashboard` (subsumed by the global Header fix).

- **Four static pages have no `generateMetadata`** · `/faq`, `/privacy`, `/terms`, `/refunds`. Only `blog/page.tsx:543` exports metadata; the others inherit the root layout's generic title/desc/OG, so ad-landed and shared links show the homepage title. **Fix:** add async `generateMetadata` to each (mirror `blog/page.tsx:543-554`) pulling title+desc from existing i18n (`faq_page.*`, `legal.<kind>.*`) — no new strings.

### POLISH

- **Two co-visible white pills on first mobile paint** · `/` ACT-1 hero, 375px guest. Hero CTA (`ScrollStage.tsx:166`) + compact Header BUY (`Header.tsx:275`, still solid white) are both at 375px. `GlobeUIOverlay` gates its CTA `hidden md:block` (line 89) — the hero/header pair didn't get the same treatment. **Fix:** make the compact Header BUY tier-2 outline on the landing hero until scrolled.

- **PricingStage pulsing pill co-exists with the Header pill** · `/` ACT-3. Both white, both `→ /pricing` (`PricingStage.tsx:262-271` + `Header.tsx:388-404`). The animated glow wins visually. **Fix:** acceptable once Header is demoted globally; otherwise no change needed.

- **`/setup` only in-body tier-1 is the third-party Happ download** · `/setup` static. Happ download is the white pill (`setup/page.tsx:96-98`); funnel actions (open dashboard, get key, support) are tier-2/tier-3. **Fix:** likely intentional (download IS the next step); reconcile with Header by demoting Header CTA on `/setup`; consider lifting "get key" to tier-2 for key-less visitors.

- **`key_pending_body` defined in both locales but never rendered** · `/dashboard` no-key-yet. `messages/{en,ru}.json:308` + `DashboardCopy` type it, but `KeyBlock` only renders `key_ready_body` and is gated on `hasKey`. **Fix:** delete the orphan key (and `reissue_disabled`, same situation) from both message files + type + `page.tsx`, OR render a muted pending KEY placeholder. Deletion is the smaller change (status_pending_body already covers the need).

- **Telegram storage/secret outages map to a non-actionable generic error** · `/login` / `/register`, TG init/claim setup error. `init/route.ts:48-54` returns `kv_not_configured` etc., but `TelegramAuthButton.tsx` `mapError` (275-298) has no case → `copy.generic` ("Try again in a minute") for an outage that won't self-resolve. **Fix:** add `storageNotConfigured`/`secretNotConfigured`/`notConfigured` to the TG copy object + `mapError` cases, mirroring `AuthForm.tsx:119-121`.

- **Auth cross-links meet 44px height but not width** · `/login` / `/register`. `login/page.tsx:58-63`, `register/page.tsx:58-64,70-75` use `min-h-[44px]` with no min-width on 11px mono labels (~40px wide). **Fix:** add `px-sm -mx-sm` or `min-w-[44px]` to the three cross-link `<Link>`s.

- **Grant secret input has no `required` / empty-secret short-circuit** · `/admin/grant`. `lookup()` (`AdminGrantClient.tsx:427-454`) only guards empty identifier; empty secret hits the API and returns a 401-mapped error. `AdminUsersClient` marks its secret `required` + short-circuits. **Fix:** mark the secret `AdminInput` `required` and/or short-circuit when `secret.trim()` is empty.

- **Grant nav renders the Users link twice** · `/admin/grant`. `AdminNav` (`AdminGrantClient.tsx:1146-1184`) has a "Back to users ←" link plus a "Users" tab, both `→ /admin/users` — two adjacent 44px targets on mobile. **Fix:** drop the standalone back link, keep only the tab row (matches Users/Analytics navs).

- **Grant KeyReveal show/copy are 36px tall** · `/admin/grant` card with key. `KeyReveal` (`AdminGrantClient.tsx:1060-1078`) uses `min-h-[36px]` for the primary reveal/copy of the VPN key. **Fix:** bump to `min-h-[44px]` (and ideally PeriodPicker presets at `1023` to 44px).

- **Analytics H1 lighter than sibling admin pages** · `/admin/analytics`. `NavTabs` active-tab `<span aria-current>` a11y is correct, but the H1 is `text-display-md` vs Grant/Users `clamp(40px,7vw,84px)`, and it lacks the "PRSLOY ADMIN" eyebrow. **Fix:** optional consistency — align the H1 scale + add the eyebrow.

- **FAQ footer shows two equal tier-3 links** · `/faq` footer. `faq/page.tsx:95-114` renders Pricing + Telegram with identical styling — no prominence signal for the next step. **Fix:** make `/pricing` a tier-1 pill and demote Telegram to a quieter support fallback.

- **DotoNumber unit labels are hardcoded English on RU pages** · `/faq`, `/privacy`, `/terms`, `/refunds`, `/blog`, RU. `faq/page.tsx:47` `unit="Q&A"`, `LegalLayout.tsx:34` `"SECTIONS"`, `blog/page.tsx:593` `"NOTES"` stay English on RU. **Fix:** defensible as monospace design tokens; if strict parity is wanted, move into i18n and translate. Flagging for an explicit decision, not a bug.
