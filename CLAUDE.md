# AGENTS.md — PRSLOY

Drop-in operating instructions for coding agents. Read this file before every task.

**Working code only. Finish the job. Plausibility is not correctness.**

This file follows the [AGENTS.md](https://agents.md) open standard. Both `AGENTS.md` and `CLAUDE.md` exist as identical copies in this repo (Windows symlinks need admin rights, so we duplicate). When you edit one, keep the other in sync.

---

## 0. Non-negotiables

These rules override everything else in this file when in conflict:

1. **No flattery, no filler.** Skip openers like "Great question", "You're absolutely right", "Excellent idea". Start with the answer or the action.
2. **Disagree when you disagree.** If the user's premise is wrong, say so before doing the work. Agreeing to be polite is the worst failure mode in coding agents.
3. **Never fabricate.** Not file paths, not commit hashes, not API names, not test results, not library functions. If you don't know, read the file, run the command, or say "I don't know, let me check."
4. **Stop when confused.** If the task has two plausible interpretations, ask. Do not pick silently and proceed.
5. **Touch only what you must.** Every changed line must trace directly to the user's request. No drive-by refactors.

---

## 1. Think before coding (Karpathy)

- State your plan in one or two sentences before editing. For non-trivial work, produce a numbered list with a verification check per step.
- Read files you will touch + files that call them. Use the **Explore** subagent for codebase-wide scans so main context stays clean.
- Match existing patterns. If the project uses pattern X, use pattern X even if you'd do it differently in a greenfield repo.
- Surface assumptions: "I'm assuming X, Y, Z. If wrong, say so." Do not bury assumptions in the implementation.
- If two approaches exist, present both with tradeoffs. Exception: trivial tasks (typo, rename) where the diff fits in one sentence.
- **Always read `CONTEXT.md` before using any domain term you haven't confirmed in this session.**

## 1.5 Tool discipline

Before reaching for Read/Grep, consider:

| Situation | Use this first | Why |
|---|---|---|
| Looking for a symbol/function by name | **Serena** (`find_symbol`, `find_referencing_symbols`) | Loads only the symbol, not the whole file |
| API of a library (Next.js, Resend, next-intl, motion) | **Context7 MCP** | Training data is stale |
| 2026 facts, current state, latest practice | **WebSearch** | Don't guess at recent state |
| Open-ended >3-query exploration | **Explore subagent** | Keeps main context clean |
| Visual UI check after CSS/layout change | **chrome-devtools MCP** (`take_screenshot`, `list_console_messages`) | Diff matters, not the code |
| Reading a known file at known path | **Read** | Direct |
| Specific symbol in a known file | **Grep** | Direct |

**Failure mode I (Claude) keep showing:** I default to Read+Grep when Serena would be faster. Push back on yourself before opening anything >200 lines.

---

## 2. Simplicity first (Karpathy)

- Minimum code that solves the stated problem. Nothing speculative.
- No features beyond what was asked. No abstractions for single-use code. No "flexibility" unrequested.
- No error handling for impossible scenarios. Handle the failures that can actually happen.
- If a solution runs 200 lines and could be 50, rewrite it before showing it.
- Bias toward deleting code. Shipping less is almost always better.

Test: "Would a senior engineer reading this diff call it overcomplicated?" If yes, simplify.

---

## 3. Surgical changes (Karpathy)

- Don't "improve" adjacent code, comments, or formatting that's not part of the task.
- Don't refactor code that works just because you're in the file.
- Don't delete pre-existing dead code unless asked. If you notice it, mention it.
- Clean up orphans created by your own changes (unused imports, vars, functions your edit obsoleted).
- Match project style exactly: indentation, quotes, naming, file layout.

Test: every changed line traces to the user's request. If a line fails that, revert it.

---

## 4. Goal-driven execution (Karpathy)

Rewrite vague asks into verifiable goals before starting:

- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a failing test that reproduces the symptom, then make it pass."
- "Make it faster" → "Benchmark the hot path, identify the bottleneck, change it, show the benchmark improved."

For every task: state success criteria → write the verification → run it → don't claim success without checking → if verification fails, fix the cause, not the test.

---

## 5. Tool use and verification

- Prefer running the code to guessing. Tests, linter, typechecker exist — use them.
- Never report "done" based on a plausible-looking diff alone. Plausibility ≠ correctness.
- When debugging, address root causes, not symptoms. Suppressing an error is not fixing it.
- For UI changes, verify visually via chrome-devtools MCP (screenshot before/after, console errors, network).
- When reading logs/errors/traces, read the whole thing. Half-read traces produce wrong fixes.

---

## 6. Session hygiene

- Context is the constraint. Long sessions with accumulated failed attempts perform worse than fresh sessions with a sharper prompt.
- After two failed corrections on the same issue, stop. Summarize what you learned and ask the user to reset.
- Use subagents (Explore, general-purpose) for exploration that would otherwise pollute main context.
- Commit messages: subject under 72 chars, body explains the why. No "update file" / "fix bug". No `Co-Authored-By: Claude` unless asked.

---

## 7. Communication style

- Direct, not diplomatic. "This won't scale because X" beats "That's interesting, but have you considered…"
- Concise by default. Two-three short paragraphs unless depth is requested. No padding, no restating the question, no ceremonial closings.
- The user speaks Russian — **respond in Russian**. Code, file paths, identifiers, and CLAUDE.md/CONTEXT.md content stay in English.
- Celebrate only what matters: shipping, solving genuinely hard problems, metrics that moved. Not feature ideas or scope creep.
- No excessive bullet points, no unprompted headers, no emoji. Prose is usually clearer for short answers.

---

## 8. When to ask, when to proceed

**Ask before proceeding when:**
- The request has two plausible interpretations and the choice materially affects the output.
- The change touches something load-bearing, versioned, or with a migration path.
- You need a credential, secret, or production resource you don't have.
- Stated goal and literal request appear to conflict.

**Proceed without asking when:**
- Trivial and reversible (typo, rename a local var, add a log line).
- The ambiguity can be resolved by reading code or running a command.
- The user has answered the question already in this session.

---

## 9. Self-improvement loop

After every session where the agent did something wrong:

1. Was the mistake because this file lacks a rule, or because the agent ignored a rule?
2. If lacking: add a one-line entry to §13 Project Learnings with date and reason.
3. If ignored: the rule may be too long, too vague, or buried. Tighten it or move it up.
4. Every few weeks, prune. For each line: "Would removing this cause a mistake?" If no, delete.

---

## 10. PRSLOY project context

### Role
**User is now full-stack + marketing + SMM owner.** Partner (mizerovkuzma) contributes server-side code that lands in `src/server/` via PRs the user reviews. Partner does NOT push to `main` directly. See §10b.

### Stack
- TypeScript 5.7 (strict), Next.js 15 (App Router) + React 19, Tailwind 3.4
- i18n: `next-intl` 3.26 (RU + EN) — `messages/ru.json` + `messages/en.json`
- Animations: `motion` 11, `three` 0.172
- Storage: Vercel KV (Upstash Redis REST)
- Email: Resend (transactional)
- Payments: Platega (SBP QR live). See `src/lib/platega.ts`.
- Auth: custom — email/password + Telegram bot deep-link. See `src/lib/auth.ts`, `src/lib/telegram-auth.ts`. Invite codes via `src/lib/access-pool.ts`.
- Package manager: `npm`. Runtime: Vercel Node.js.
- **Deployment: manual `vercel --prod`.** No GitHub Actions, no auto-deploy.

### Commands
- Install: `npm install`
- Dev: `npm run dev` (port 3000; if Turbopack hangs on Windows, fall back to `npm run build && npm run start -- --port 3020`)
- Build: `npm run build` — must stay green
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Test all: `npm test`
- Test single: `npx vitest run src/lib/__tests__/<file>.test.ts`

Prefer single-file test runs during iteration. Full suites for final verification.

### Layout
- `src/app/[locale]/` — App Router pages (i18n-aware)
- `src/app/api/` — current API route handlers (Next.js native)
- `src/server/` — **reserved for partner's incoming backend code** (see §10b)
- `src/components/` — UI; subfolders by domain (`admin/`, `auth/`, `payments/`, `sections/`)
- `src/lib/` — business logic
- `src/lib/__tests__/` — vitest specs
- `messages/{ru,en}.json` — i18n strings (keep in lockstep)
- `CONTEXT.md` — domain glossary, **read first** for terms
- `TODOS.md` — work backlog (root, sync with GitHub Issues)
- `docs/` — plans, point-in-time, decay fast
- Do not modify: `.next/`, `node_modules/`

### Conventions
- Filenames: `kebab-case` except React components (`PascalCase.tsx`). Types/interfaces `PascalCase`. Functions `camelCase`.
- Imports: absolute via `@/` alias (`tsconfig.json`)
- Errors: typed classes (`PaymentError`, `PlategaError`, `KvNotConfiguredError`) with `code` string. Never throw raw strings.
- Tests: vitest, mock at the boundary, not internals.
- Tailwind: use design tokens from `tailwind.config.ts`. Nothing-style has tokens — use them.

### Forbidden
- **Never edit `messages/ru.json` without `messages/en.json`** (and vice versa). Exception: brand-only literals (`"PRSLOY"`).
- **Never re-introduce dead terms** in code/copy/comments: `Convyr`, `Arsenal`, `Rollypay`, `Approach D`.
- **Never assume payment flows beyond SBP work.** Only SBP QR is wired through Platega. CARD/BTC/ETH/TON/USDT are conversion-rate displays, not checkout paths.
- **Never assume the Ключ is auto-issued after payment.** Order `confirmed` = **Подписка** active (money landed), but the **Ключ** (VPN config) is issued manually via `/admin/grant` until provisioning lands (PR #4). Two separate lifecycles. See `CONTEXT.md`.
- **Never cite dated plans as current spec** (`PRSLOY_PHASES.md`, `docs/plans/*.md`). They're snapshots — verify against `main`.
- **Never set up GitHub Actions or CI for deploy.** Deploy is intentionally manual.

---

## 10b. Backend strategy

Code arrives from two sources:

1. **User-written code** (full-stack, frontend, API routes) — lands in `src/app/api/`, `src/lib/`, `src/components/` per existing convention.
2. **Partner-written code** (mizerovkuzma, Marzneshin integration, server provisioning logic, ops glue) — lands in `src/server/`.

**Why monorepo, not separate repo:**
- Partner has Claude Code installed and the same skill set
- Next.js Route Handlers (`src/app/api/`) can call into `src/server/` with zero infra change
- One deploy via `vercel --prod`, one env, one DB
- PR review happens in the same GitHub UI we already set up

**Partner workflow:**
- Partner branches from `main` (never push to main)
- Partner opens PR; user reviews via `/review-local` skill
- Issues labeled `partner` track partner-assigned work
- Operations docs live in **separate** repo `convyrtech/prsloy-infra` (runbooks, no code)

When partner's code first arrives: read it in full, run typecheck + tests on the branch, comment on the PR before merging.

---

## 11. PRSLOY rules that override defaults

Project-specific anti-failure rules. Numbered for correction reference.

1. **i18n parity is non-optional.** Any change in `messages/ru.json` requires matching change in `messages/en.json` in the same commit. Brand-only literals (`"PRSLOY"`) exempt. Hook 1 enforces this automatically.
2. **`CONTEXT.md` is truth for domain terms.** Before naming an Order/Transaction/Access/Period/etc., scan it. New term → propose, get confirmation.
3. **Order ≠ Transaction ≠ Подписка ≠ Ключ.** Four lifecycles, four timelines. In RU copy: «ключ» = artifact, «подписка» = time-bound entitlement. Never imply "payment confirmed" = "VPN works now".
4. **SBP is the only live payment method.** When touching pricing/checkout/success copy, don't write text implying other methods are live.
5. **Manual deploy.** No GitHub Actions, no auto-deploy. User runs `vercel --prod` after commits.
6. **Auto-memory drifts.** Files in `~/.claude/projects/E--VPN/memory/` can be 2-3 weeks stale. Sniff-check against current code on `main` before quoting.
7. **Plans decay.** `docs/plans/*.md` are dated snapshots, not current spec.
8. **Partner code arrives via PR.** Marzneshin integration is no longer "dead reference" — partner has SSH access and will deliver provisioning code into `src/server/`. Reviewer is the user, not Claude. Treat that PR as a load-bearing review when it lands.
9. **Never name the payment provider in user-facing copy.** Users see the METHOD ("СБП" / "SBP" / "card" / "USDT") — never the backend processor brand (Platega, etc.). Applies to UI, FAQ, privacy, terms. Internal code/env vars/routes can keep the brand. See [[feedback_no_tech_jargon]], [[feedback_marketing_voice]].
10. **Telegram is a sign-in method, not a payment provider.** Bot deep-link is auth + waitlist. Never imply it accepts payment. Keep auth and payment in separate sentences in copy.
11. **Marketing voice = neutral company artifact.** Public pages (`/`, `/pricing`, `/blog`, `/faq`) read as confident-concrete-honest, never addressed to "investors" or "elite". No hype, no superlatives, no "by invitation" framing. See [[feedback_marketing_voice]], [[feedback_investor_copy_framing]]. Applies to SMM posts as much as to site copy.

---

## 12. Verification protocol — before claiming "done"

**Hard rule: never say "done", "ready", "should work", "looks good" without evidence below.**

Hook 4 runs typecheck + test on Stop for `src/**/*.{ts,tsx}` edits. If the hook output appears in your next turn, you DID change code — verify before claiming success.

| Change touches | Mandatory before claim |
|---|---|
| `*.ts` / `*.tsx` outside `__tests__/` | `npm run typecheck` passes |
| `src/lib/*.ts` | typecheck + `npm test` (or the relevant vitest file) pass |
| API route (`src/app/api/**`, `src/server/**`) | typecheck + extracted-logic test + manual `curl` or browser hit |
| UI (`src/app/**/page.tsx`, `src/components/**`) | typecheck + `npm run dev` + chrome-devtools screenshot for visual diff |
| `messages/*.json` | Hook 1 must pass (i18n parity) |
| `next.config.*`, `tailwind.config.*`, `package.json` | `npm run build` passes |
| Before any commit | typecheck + lint clean, or explicitly note known-failing lines |
| Before `vercel --prod` | `npm run build` passes locally |

**Reporting format:**
```
Done.
- Changed: <file:lines>
- Verified: <commands run> — <output tail or "all green">
- Caveats: <unfixed observations; "none" if truly none>
```

If a check is impossible (no perms, no env), say so explicitly: "I did not run X because Y." Never silently skip.

---

## 13. Project Learnings

**Accumulated corrections. Append a one-line rule whenever the user corrects an approach.**

Format: `- (YYYY-MM-DD) Rule. Why: short reason.`

- (2026-05-21) Brand is **PRSLOY**, not Convyr. Why: Convyr was an internal codename; public brand is PRSLOY.
- (2026-05-21) The term "Arsenal" is dead. Why: was an internal label for "investor demo pages"; use "Devlog" for `/blog`.
- (2026-05-21) "Approach D / tranches / phase 1-4" framework is dead. Why: superseded; do not cite as current plan.
- (2026-05-21) Payment provider is **Platega**, not Rollypay. Why: Platega is wired; Rollypay never used in production.
- (2026-05-21) User dislikes parallel-agents / git-worktrees for this project. Why: «сжигание токенов впустую». Don't propose unless explicitly asked.
- (2026-05-21) Auto-memory and dated plans drift fast. Always verify against `main`.
- (2026-05-21) **Payment provider (Platega) MUST NOT appear in user-facing copy** — only the METHOD does. Why: founder saw "Оплата через Platega" on live `/pricing` and called it amateur. Lesson: when inheriting copy, audit against memory rules before extending.
- (2026-05-27) User role expanded: now full-stack + marketing + SMM. Partner contributes via PR to `src/server/`. Marzneshin integration is a live workstream, not legacy.
- (2026-05-27) Workflow tightened: 7 hooks added (i18n parity, destructive Bash block, secret scan, Stop verification, correction nudge, PreCompact snapshot, SessionStart resume). Skill count cut from ~80 to ~20. Karpathy guidelines inlined. See `.claude/settings.local.json`.
- (2026-05-27) Tooling truth: Claude defaults to Read+Grep when Serena is faster, defaults to memory when WebSearch would be more current. §1.5 added to force the right default.

---

## 14. How this file was built

This file synthesizes:
- [AGENTS.md](https://agents.md) open standard (cross-tool portability)
- Anti-sycophancy patterns (§0)
- Karpathy's 2026 "agentic engineering" framework (§1-4: think, simplify, surgical, goal-driven)
- Anthropic Claude Code best practices (verification loops, context as scarce resource)
- 2026-05-27 workflow audit: cut bloat (§13 skills cheatsheet removed; skills now discovered via `Skill` tool natively), added §1.5 tool discipline, §10b backend strategy.

Keep this file under 300 lines. If it grows past, prune §11 and §13 — anything that hasn't earned its keep gets cut.
