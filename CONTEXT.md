# PRSLOY

PRSLOY is a private VPN with open registration. This document defines the domain vocabulary for the site at `prsloy.online` so terms stay consistent across code, copy, and conversation.

## Language

### Brand & site

**PRSLOY**:
The product brand. Private VPN, open registration (invite gate removed 2026-07-02). Always written uppercase in copy and code identifiers.
_Avoid_: Convyr (dead codename), "the site", "our VPN".

**PRSLOY ID**:
A user account on `prsloy.online` (email + password, or Telegram sign-in). Created via `/register`, used to sign in at `/login`, links to one Dashboard. Telegram-created accounts have no email until they link one at checkout (`linkEmail`) — payment requires an email for the receipt.
_Avoid_: account, user account, profile.

**Dashboard / ЛК**:
The signed-in surface at `/dashboard`. Shows Access state, payment history, setup guide entry. **In Russian copy use "ЛК"** (founder's canonical term). In English copy and code identifiers use "Dashboard".
_Avoid_: "кабинет", "личный кабинет" (use the abbreviation "ЛК" instead).

**Devlog**:
The public `/blog` page. Public-facing build log; reads as a neutral company artifact, never explicitly addresses investors. See [[feedback_investor_copy_framing]].
_Avoid_: Arsenal (dead internal label), "investor blog".

### Billing

**Period**:
A billing duration. Exactly three values: `1mo`, `6mo`, `1yr`. Defined in `src/lib/pricing.ts`.
_Avoid_: tier, plan, subscription length.

**Price**:
Per-month USD price by Period: $5 / $4 / $3. Total = price × months. RUB conversion uses a hardcoded `RUB_PER_USD = 90`.

**Method**:
A payment method. **`SBP` and `USDT` (crypto) are wired through the Provider today** — `CARD`/`BTC`/`ETH`/`TON` appear in the pricing UI conversion display but do not have a live checkout flow.

**SBP**:
СБП (Система Быстрых Платежей) — Russian instant-payments protocol. One of the two live payment methods (with USDT), settled in RUB.

### Payments domain

**Provider**:
The external payment processor. Today: **Platega** only. See [[project_payment_provider]]. The Provider takes money from the user and notifies us via callback.
_Avoid_: Rollypay (dead — never used in production).

**Order** (`PaymentOrder`):
A payment intent linked to one PRSLOY ID, one Period, one Method. Has an internal `status` lifecycle. Persisted in Vercel KV. Defined in `src/lib/payments.ts`.

**Transaction**:
Platega's identifier for a single payment attempt. An Order gains a `transactionId` once Platega has accepted the create request and returned a `paymentUrl`. One Order has at most one Transaction.

**Status** (Order):
Our internal payment lifecycle: `created → pending → (confirmed | canceled | chargebacked | failed)`. Distinct from **Provider Status** (the raw string from Platega — `PENDING`, `CONFIRMED`, etc.) which we map to Status via `providerStatusToPaymentStatus`.

**Подписка** (Subscription):
The time-bound paid entitlement. Becomes active when the user's Order reaches `status: confirmed` (Provider notified us that money landed). Expressed by `Order.period` (`1mo` / `6mo` / `1yr`). In RU copy: «подписка». In English: "subscription".
_Avoid_: "plan", "tier", "membership" — say "подписка / subscription".

**Ключ** (Key):
The actual VPN config artifact a paid user puts into their Happ-style client. Issued **automatically** right after the Order reaches `confirmed` (auto-issue via the provisioning proxy, `issueKeyForOrder`). If auto-issue fails, the Order carries `issueError` and the operator recovers via `/api/admin/reprocess`; manual `/admin/grant` is the last-resort fallback. **Подписка active ≠ Ключ issued.** Treat them as two separate lifecycles.
_Avoid_: "access", "credentials", "доступ", "конфиг" in product copy — say "ключ / key".

**Grant**:
Manual issuance of a Ключ by an operator — the exception path since auto-issue went live. Endpoint `POST /api/admin/grant`, protected by `ADMIN_SECRET`. The path `/admin/grant` is the operator UI.

**Reissue**:
Replacing an existing user's Ключ (compromised key, lost device, etc.). User-initiated request flow exists; operators fulfill from `/admin/users` or the reissue queue. Подписка is not affected by Reissue — only the artifact changes.

### Client

**Happ**:
The recommended third-party VPN client we point users at from `/setup`. iOS / Android / desktop. PRSLOY does not ship its own client — see [[project_no_own_app]].
_Avoid_: "our app", "the PRSLOY app".

## Flagged ambiguities (dead terms)

These appear in older notes, plans, or external conversations. They are **not** part of the current vocabulary and should not be used in new work:

- **Convyr** → use **PRSLOY**.
- **Arsenal** → use **Devlog** (for the `/blog` page) or describe the principle directly (see [[feedback_investor_copy_framing]]).
- **Rollypay** → use **Platega** (or just **Provider**).
- **Marzneshin** → the partner's old backend. Not load-bearing for current work. Don't assume anything in that stack is current; verify against `main` before relying on it.
- **Approach D / tranches / phase 1-4** → strategy snapshot from May 2026, superseded. Don't cite as current plan.

## Example dialogue

> **dev:** "After Platega confirms the payment, the user gets the Ключ automatically, right?"
> **founder:** "Usually yes — confirmed Order means money landed and **Подписка is active**, and auto-issue delivers the **Ключ** to the ЛК right after. But they are still two lifecycles: auto-issue can fail, the Order then carries `issueError`, and the operator re-drives it via `/api/admin/reprocess`."
> **dev:** "Got it. So `confirmed` on the Order = Подписка active, and the Ключ follows automatically — with a manual recovery path when it doesn't."
> **founder:** "Right. And don't confuse Transaction (Platega's ID for the charge) with Order (our row). One Order → one Transaction → one Подписка → one Ключ. Four things on four timelines."
