# Findings & Decisions

## Requirements
- Do not push to the partner's `main`.
- Do not edit partner code yet; first understand what exists.
- Focus on the VPN/core/backend side.
- Telegram WebApp UI is not a priority except where it talks to the core.
- Tomorrow's likely work is continuing the user's own site and making it line up with the real product/backend.

## Research Findings
- Current workspace is `E:\VPN`.
- Current repo remote is `https://github.com/convyrtech/convyr-vpn`.
- Current `E:\VPN` worktree is dirty with many deleted old backend files and many untracked site files (`src`, `docs`, `messages`, Next/Tailwind configs, etc.).
- Because the workspace is dirty, the partner repo should be cloned or fetched into an isolated audit folder.
- Partner repo cloned into `E:\VPN\_audit\not_for_all`.
- Inspected branch is `main`.
- Inspected commit is `cbc787dcda765c03535da58e9634bef9ffce8e92`.
- Top-level stack appears to be Python/FastAPI backend, aiogram Telegram bot, static mini-app frontend, Marzneshin control plane, PostgreSQL, nginx/systemd/ops scripts.
- README describes VLESS+Reality over bridge/exit node topology with Marzneshin as panel/control plane.
- Frontend contains many cache-busted `k2vNN` JS/CSS files, which looks like manual/static version churn rather than a normal frontend build pipeline.
- Runtime dependencies are Python-only in `requirements.txt`; no frontend package manifest was found at top level.
- Current site in `E:\VPN` is a Next 15 / React 19 / Tailwind / next-intl project with source under `src/`.
- Current site integration candidates are landing/pricing/dashboard pages under `src/app/[locale]/` and section components under `src/components/sections/`.

## Core Architecture Map
- `backend/main.py` is the FastAPI app. It mounts auth, user, misc, pay, subscribe, and admin routers under `/api/v5`; it also exposes `/health`, `/healthz`, and `/metrics`.
- `backend/config.py` loads only `/opt/hellcat-app/.env` and requires `BOT_TOKEN`, `JWT_SECRET`, `PANEL_USER`, `PANEL_PASS`, and `DATABASE_URL`.
- `backend/db.py` uses SQLAlchemy async sessions with PostgreSQL.
- `migrations/001_initial.sql` is a raw pg_dump-style schema file. README calls migrations "Alembic", but the repo does not contain `migrations/alembic.ini`, and `requirements.txt` does not include Alembic.
- `backend/marz.py` is the Marzneshin client: admin token cache, shared aiohttp session, user create/get/extend/delete/regenerate, nodes and inbounds listing.
- `backend/users_service.py` is the user provisioning core: Telegram user -> Marzneshin user -> `shortlinks.json` slug mapping -> `app_users` row.
- `backend/routes/auth_routes.py` validates Telegram WebApp `initData`, creates the user on first auth, and returns a JWT plus slug.
- `backend/routes/user_routes.py` exposes user status, config summary, stats, referrals, rank, and key regeneration.
- `scripts/hellcat-shortlink.py` serves `/s/<slug>` by translating it to Marzneshin `/sub/<username>/<key>` and has a Happ/V2Box/FoXray/Shadowrocket compatibility layer.
- `infra/nginx/cloudasset` routes `/s/<slug>` to the shortlink service on `127.0.0.1:8001`, `/sub/` to Marzneshin on `127.0.0.1:8000`, and `/api/v5/` / `/v5/api/` to FastAPI on `127.0.0.1:8100`.
- `bot.py` is a large aiogram bot that shares backend code by inserting `/opt/hellcat-app/backend` into `sys.path`.

## Likely Launch Blockers / Risks
- Fresh deploy instructions are inconsistent: README says `venv/bin/alembic -c migrations/alembic.ini upgrade head`, but no Alembic config/dependency exists. A fresh install may fail unless schema is loaded manually.
- The code is tightly bound to one production layout: `/opt/hellcat-app`, `/var/lib/hellcat`, `cloudasset-dl.com`, and hardcoded Telegram admin/support IDs appear in app, nginx, docs, and ops scripts.
- Public frontend/backoffice code is static cache-busted JS (`k2vNN`) with many old versions committed. There is no normal frontend build source of truth in this repo.
- The authoritative user subscription URL in actual UI appears to be `/s/<slug>`, but `backend/routes/user_routes.py` returns `subscriptionUrl` as `/sub/<slug>`. If a new site trusts that API field, it may generate broken links.
- VPN stability depends heavily on Marzneshin, node health, bridge->exit chains, shortIds, and the shortlink shim. There are watchdogs, but there are also documented known gaps around chain probe coverage and upstream marznode races.
- The e2e probe has hardcoded expected exit IPs and chain names. If infra changes without updating the probe, it can report wrong failures or miss real broken chains.
- Docs conflict with current scripts in places: older ops docs still say PG backup is TODO, while current `hellcat-backup.sh` now dumps both PG databases. Treat docs as partial history, not source of truth.
- No real automated backend test suite was found. Only ops/manual chain tests were present.

## Site Integration Boundary For Tomorrow
- Do not port the partner mini-app UI. Treat it as legacy.
- For the public site, use backend only as a product/API boundary:
  - Health/status copy can reflect `/api/v5/health` and `/api/v5/servers`.
  - Subscription/deep-link CTA should point to Telegram bot / WebApp until non-Telegram auth exists.
  - If showing a config/subscription link for an authenticated user, prefer `/s/<slug>`, not the suspicious `/sub/<slug>` field.
  - Pricing can be mirrored from `/api/v5/config` once the production API domain is known.
- The current Next site should not depend directly on partner repo internals; it should call documented HTTP endpoints or link to Telegram.

## PRSLOY Site Context
- `.vercel/project.json` links this workspace to a Vercel project named `prsloy`, but the public deployment URL was not confirmed from local files or search.
- Local `next start --port 3020` works from the existing `.next` build. `next dev --turbopack` currently fails on Windows with `spawn EPERM`.
- The live local page at `/en` has the intended cinematic/Nothing-inspired PRSLOY direction: dark UI, mechanical header, particle wordmark, scroll story, globe, pricing act, FAQ, footer departure board.
- Full HD screenshot captured at `E:\VPN\preview\prsloy-en-1920x1080.png`; a second animation-settled frame is `E:\VPN\preview\prsloy-en-1920x1080-5s.png`.
- In Full HD, the hero is stable and premium, but very empty for the first screen: the product message sits low/right while the top 70% is mostly black or particles. This is aesthetic, but risky for an investor/product demo.
- The narrow viewport first screen still has visual overlap: the particle `PRSLOY`, hero headline, subcopy, and header buy pill compete with each other. Treat this as a demo-blocking polish issue for mobile.
- Primary CTAs point to `/pricing`, but `/ru/pricing` is only `[ PRICING · COMING SOON ]`. Other nav destinations (`/faq`, `/dashboard`, `/privacy`, `/terms`, `/blog`) are also placeholders.
- English `/en/pricing` is also `[ PRICING · COMING SOON ]`, so the current CTA loop breaks immediately after intent.
- Interactivity found:
  - Header mobile menu opens/closes and exposes nav + language switch.
  - Hero particles animate on canvas and react to mouse movement.
  - Main story is scroll-driven: hero -> handshake -> globe -> overlay -> pricing -> FAQ -> footer.
  - Globe code supports drag rotation and node hover tooltips.
  - Pricing payment method pills update displayed converted amount.
  - Footer departure board cycles rows with flip/pulse animations.
- Current copy makes production-strength claims that do not match the audited state yet: `12 СТРАН`, `142 ЖИВЫХ`, `99.97%`, `ВСЕ СИСТЕМЫ В НОРМЕ`, `БЕЗ ЛОГОВ`, `БЕЗ ЛИМИТА`, `ВОЕННОЕ`, and automatic health/rotation claims.
- The useful app-positioning line is already present: today the key works with Happ / Hiddify / NekoBox; a native Android client based on Happ can be framed as roadmap, not as a near-term dependency.
- Before showing investors, the site should sell the real beta product: key delivery, compatible clients, tested routes, current capacity, and Telegram activation. Own app/fork belongs in roadmap copy.

## Technical Decisions
| Decision | Rationale |
|----------|-----------|
| Use separate audit directory for `not_for_all` | Prevents accidental overwrite or confusion with the user's current site repo. |
| Record inspected branch/commit | Avoids later confusion about what code was reviewed. |

## Issues Encountered
| Issue | Resolution |
|-------|------------|
| Workspace already has unrelated local changes | Leave them untouched and inspect partner code separately. |
| `rg --files` failed with access denied in the cloned repo | Used PowerShell recursive file listing instead. |
| README migration command references missing Alembic files | Flagged as launch blocker; do not follow README blindly for fresh deploy. |
| API `subscriptionUrl` shape conflicts with UI `/s/<slug>` behavior | Flagged for tomorrow's site integration; avoid using `/sub/<slug>` unless verified against production. |
| `next dev --turbopack` failed with `spawn EPERM` | Used existing production build with `next start --port 3020` for local inspection. |

## Resources
- Partner repo URL: https://github.com/convyrtech/not_for_all
- Current workspace remote: https://github.com/convyrtech/convyr-vpn
- Local partner audit clone: `E:\VPN\_audit\not_for_all`
