# Task Plan: Partner Repo Audit

## Goal
Map the partner's `convyrtech/not_for_all` repository read-only, ignoring Telegram WebApp UI except where it calls core logic, and produce a practical handoff for tomorrow's PRSLOY site work.

## Current Phase
Phase 6

## Phases

### Phase 1: Requirements & Workspace Safety
- [x] Capture user intent
- [x] Identify no-push/no-main constraint
- [x] Check current workspace state
- [x] Document initial findings
- **Status:** complete

### Phase 2: Acquire Partner Repo
- [x] Fetch/clone `https://github.com/convyrtech/not_for_all` into an isolated audit directory
- [x] Avoid mixing partner code with current `E:\VPN` site worktree
- [x] Record branch/commit inspected
- **Status:** complete

### Phase 3: Core Architecture Map
- [x] Identify stack, entrypoints, runtime commands, and config files
- [x] Map core backend/VPN modules
- [x] Ignore Telegram WebApp UI except integration boundaries
- **Status:** complete

### Phase 4: Risk List
- [x] Find likely causes of VPN instability/connection drops
- [x] Identify hardcoded secrets, brittle state, missing monitoring, and deployment hazards
- [x] Separate must-fix from later cleanup
- **Status:** complete

### Phase 5: Handoff
- [x] Summarize what exists
- [x] Summarize what is broken/risky
- [x] Propose tomorrow's site integration tasks
- **Status:** complete

### Phase 6: PRSLOY Site Context
- [x] Confirm local site stack and Vercel project link
- [x] Run or inspect the current site
- [x] Identify demo-blocking route/copy/visual issues
- **Status:** complete

## Key Questions
1. What is the actual core of `not_for_all` and what can be ignored as Telegram WebApp UI?
2. What technical choices explain current VPN instability and connection drops?
3. What does the site need to integrate with tomorrow: API endpoints, payment flow, config issuing, auth, analytics?

## Decisions Made
| Decision | Rationale |
|----------|-----------|
| Inspect partner repo in an isolated audit directory | Current `E:\VPN` worktree is dirty and should not be mixed with external code. |
| Treat today's work as read-only audit | User explicitly said not to push to partner main and wants understanding first. |
| Ignore Telegram WebApp UI except core boundaries | User said Telegram WebApp is not interesting; core is the priority. |
| Treat own app/fork as roadmap, not launch promise | Current working product should sell VPN keys through existing compatible clients first. |

## Errors Encountered
| Error | Attempt | Resolution |
|-------|---------|------------|
| Initial `Get-ChildItem -Force` through parallel shell failed with `CreateProcessWithLogonW failed: 1056` | 1 | Retried with simpler `Get-ChildItem -Name -Force`, which succeeded. |
| `rg --files` in cloned repo failed with Windows `Access denied` | 1 | Used PowerShell `Get-ChildItem -Recurse -File` instead. |
| `next dev --turbopack` failed with `spawn EPERM` | 1 | Used the existing `.next` production build through `next start --port 3020` for site inspection. |
