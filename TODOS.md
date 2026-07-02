# TODOS

Mirrors open GitHub Issues + ongoing workstreams. Synced with [Project board](https://github.com/users/convyrtech/projects/1).

---

## Active workstreams (P0–P1)

### Rotate TELEGRAM_BOT_TOKEN (Issue [#5](https://github.com/convyrtech/PrsloyVPNsite/issues/5))

**What:** Перевыпустить bot token, обновить env на Vercel (production + preview), пересохранить webhook.

**Why:** Текущий токен светился в чате во время отладки QA. Формально скомпрометирован.

**Context:** @BotFather → `/revoke` → новый token в `vercel env`. Перепроверить webhook setWebhook хитом нового URL. См. body Issue #5.

**Effort:** XS (5 минут руками)
**Priority:** P0
**Owner:** convyrtech
**Depends on:** ничего

---

### Rotate ADMIN_SECRET (Issue [#21](https://github.com/convyrtech/PrsloyVPNsite/issues/21))

**What:** Перевыпустить `ADMIN_SECRET`, обновить env на Vercel (production + preview), передеплоить, проверить вход в админку.

**Why:** Единый секрет, закрывающий весь админ-surface — `/api/admin/grant`, `/issue`, `/reprocess`, `/users`, `/lookup`, `/access` (проверка per-request в `src/lib/admin-auth.ts`). Старое значение светилось в чате → скомпрометировано. Утечка = кто угодно может выдавать ключи Marzneshin, грантить доступ, читать записи юзеров.

**Context:** `openssl rand -hex 32` → `vercel env` (prod+preview) → `vercel --prod`. In-app сессии нет (сверка per-request), хватает обновления env + редеплоя. Проверка: новый секрет → 200, старый → 401. **Отдельно от #5** (`TELEGRAM_BOT_TOKEN`) — другой секрет, тот же класс «утёк в чате».

**Effort:** XS (5 минут руками)
**Priority:** P0
**Owner:** convyrtech
**Depends on:** ничего

---

### Auto-issue Marzneshin keys after payment confirmation (Issue [#4](https://github.com/convyrtech/PrsloyVPNsite/issues/4))

**Status (2026-06-04): ✅ выдача зашита и проверена в проде.** На `payment_confirmed` (Platega callback) `src/lib/payments.ts:238` вызывает `issueKey()` → сохраняет `subscription_url` → переводит юзера в active на `/dashboard`. Шипнуто в `71cb457` (2026-06-03), проверено в проде 2026-06-04 через `POST /api/admin/reprocess {email}` (`confirmedNow:true`, `source` flipped `manual-grant`→`auto-issue`, paying-counter 0→1). Идемпотентность по `payment_id`, падение не откатывает заказ.

**Исходная задача (выполнена):** при `payment_confirmed` автоматически создавать пользователя в Marzneshin и выдавать `subscription_url` на `/dashboard` вместо ручного `/admin/grant`. Узкое горлышко >10 платежей/день снято.

**Остаётся открытым — инфра партнёра, не код сайта:**
- **Bootstrap нод:** активна 1 local node — `subscription_url` может отдавать пустой/частичный конфиг, пока партнёр не поднимет остальные. До этого ключ выдан, но VPN не обязательно работает end-to-end.
- **Custom-days:** партнёрский `/external/issue-key` 400-ит на нестандартных `period_days` — работают только 30/180/365. Платный путь не задет (реальные продукты = стандартные периоды); бьёт только админскую «произвольно N дней» карту.

**Архитектура (решено 2026-05-27):** PRSLOY НЕ ходит в Marz напрямую — Marz API биндится только на `127.0.0.1` партнёрского сервера, наружу не торчит, Vercel не дотянется. Подключение через **proxy в partner backend** (`/opt/hellcat-app`):

```
Vercel (PRSLOY) ──POST /external/issue-key (HMAC)──► Partner backend ──► marz.create_user() ──► Marzneshin
                                                          (готовый код из not_for_all/backend/marz.py)
```

Партнёр написал ~30-line endpoint на FastAPI с HMAC-проверкой. PRSLOY-клиент = `src/lib/marzneshin-proxy.ts` (зашит в `src/lib/`, НЕ в `src/server/`) — тонкий HTTP-клиент к этому endpoint.

Полная спека: [`prsloy-infra/marzneshin-api-spec.md`](https://github.com/convyrtech/prsloy-infra/blob/main/marzneshin-api-spec.md)

**Context:**
- Marzneshin: `dawsh/marzneshin:v0.7.4`, 65 endpoints, FastAPI, JWT TTL 8h
- Готовый Python-клиент уже есть в `convyrtech/not_for_all/backend/marz.py` (token cache 6h, retry 401, race-locks на extend, retry 5xx с jitter) — партнёр оборачивает его в свой endpoint
- Идемпотентность через `payment_id` как ключ (409 на повтор)
- Rollback: если Marz down → ставим флаг `provisioning_pending` в order, юзер видит «выдадим в течение часа» вместо ошибки

**Open questions (нужны решения перед production):**
- Service ID: общий `id=1` (Hellcat Premium) или новый `id=2` (PRSLOY Premium)? Решаем через env `MARZ_SERVICE_IDS`, default `[1]`, флаг к разделению — отдельная задача.
- Username prefix: `p_<userId>` (12-hex lowercase) — без collision с Hellcat-схемой
- HMAC shared secret: партнёр генерирует, обе стороны кладут в env
- Non-sudo admin: партнёр создаёт через `POST /api/admins`, отдаёт login/password для своего env (PRSLOY не получает Marz creds)

**Effort:** Vercel-side ✅ done. Остаток = партнёрский bootstrap нод (вне этого репо).
**Priority:** P1 (код done; держим открытым до рабочего end-to-end VPN после поднятия нод)
**Owner:** convyrtech (Vercel side ✅) + mizerovkuzma (ноды)
**Done (доказано работающей auto-issue в проде 2026-06-04):**
- ✅ Партнёр написал `POST /external/issue-key` в hellcat-app
- ✅ HMAC shared secret сгенерирован, лежит в env обеих сторон
- ✅ non-sudo admin в Marz создан
- ✅ PRSLOY-клиент `src/lib/marzneshin-proxy.ts` + проводка в `src/lib/payments.ts`

**Остаётся (блокер рабочего VPN, НЕ блокер выдачи):** партнёр поднимает остальные nodes — сейчас активна 1 local node, `subscription_url` отдаёт пустой/частичный конфиг до bootstrap'а.

---

### Смена ключа (rotate) + отзыв (revoke) на прокси — перевыпуск не закрывается одной кнопкой

**What:** В ЛК есть запрос «Перевыпуск», но в админке нет операции «заменить ключ»: `/api/admin/issue`
продлевает тот же **стабильный** URL (партнёрская точка — create-or-extend, см. `admin-issue.ts:16-23`),
а ручной `/admin/grant` требует создать конфиг руками в панели на сервере и не гасит старый ключ
(отзыва нет — старая ссылка продолжает работать). «Второй ключ» на аккаунт не предусмотрен моделью:
одно поле `subscriptionUrl` на PRSLOY ID, одна запись `marzneshin:user:<id>`.

**Why:** перевыпуск сегодня = ручная работа оператора, и «замена» не закрывает компрометацию
(старый конфиг жив). Коммерческий уровень — одна кнопка в очереди перевыпуска.

**Context:** нужен контракт на прокси (соло-бэкенд): `POST /external/rotate-key` (пересоздать конфиг
marz-пользователя, вернуть новый URL, погасить старый) и `POST /external/revoke`. После этого на
сайте: кнопка «Перевыпустить» в `/admin/users` → rotate → `grantSubscriptionByUserId` →
`markReissueHandled`; заодно закрывается отложенный revoke (блокировка/возврат платежа реально
отключает VPN). «Второй ключ» — отдельное продуктовое решение: одна ссылка-подписка уже покрывает
все устройства (Happ); мультиключ = новая модель данных, делать только если появится реальный спрос.

**Effort:** M (прокси) + S (сайт)
**Priority:** P1
**Owner:** convyrtech
**Depends on:** доступ к серверу (соло-бэкенд)

---

### UI/UX админки: возврат с подстраниц (Issue [#3](https://github.com/convyrtech/PrsloyVPNsite/issues/3))

**What:** Невозможность нормально вернуться с `/ru/admin/analytics` на `/admin`. Перепроверить ту же проблему на других страницах админки.

**Why:** Тебе самому неудобно ходить по админке во время фактического использования.

**Context:** Скорее всего нужна breadcrumb-навигация или admin layout с persistent sidebar. Перед фиксом — пройтись по всем `/admin/*` страницам и зафиксировать паттерн.

**Effort:** S
**Priority:** P1
**Owner:** convyrtech
**Depends on:** ничего

---

### Marketing voice audit

**Status (2026-07-02): ✅ выполнено** в рамках открытия регистрации (ветка `feat/open-funnel`): «по приглашению» и витрина дефицита убраны со всех страниц, SEO-мета и OG-картинка переписаны. См. `docs/plans/2026-07-02-open-funnel.md`.

**What:** Пройтись по `/`, `/pricing`, `/blog`, `/faq` и убрать всё что звучит «для инвесторов», «элитарно», «по приглашению».

**Why:** CLAUDE.md §11.11 — copy должна быть neutral company artifact. Memory rule [[feedback_marketing_voice]]. После приёма новой роли (теперь и marketing) — это твоя зона.

**Context:** Прошлый аудит был 2026-05-21. Возможно есть новый дрейф после Step 2.

**Effort:** S–M (зависит от сколько уехало)
**Priority:** P2
**Owner:** convyrtech
**Depends on:** ничего

---

### Onboard mizerovkuzma в Claude Code workflow

**What:** Пошаговая инструкция «как запустить Claude Code в этом репо» на русском.

**Why:** Партнёр имеет Claude Code, не умеет им пользоваться. Без онбординга он не запушит первый PR в `src/server/`.

**Context:** Делаем когда первый PR от него — пройдёмся вместе. Не сейчас, преждевременная документация.

**Effort:** S (когда дело дойдёт)
**Priority:** P2 → P1 когда партнёр готов начать
**Owner:** convyrtech
**Depends on:** Партнёр готов начать PR-flow

---

## Analytics

### Chart over time в /admin/analytics

**What:** День-за-днём line chart (pageviews по локалям, UTM split, funnel conversion) поверх существующих таблиц.

**Why:** После запуска рекламы первый вопрос будет «как мы росли по дням». Таблица за выбранный день не отвечает на трендовые вопросы.

**Context:** Counters уже хранятся per-day в формате `analytics:{env}:pv:DATE:{path}`. Достаточно прочитать последние 14 дней и отрисовать line chart. Требует +recharts (~50KB) или альтернативу. Делать ПОСЛЕ накопления 7-14 дней данных, иначе график будет пустой.

**Effort:** M
**Priority:** P3
**Depends on:** Initial analytics MVP merged + 7+ дней реальных данных в KV

---

### GeoIP enrichment из Vercel headers

**What:** Сегментация pageview/funnel/UTM counters по стране (RU / US / DE / ...) через `x-vercel-ip-country` request header.

**Why:** При запуске рекламы в РФ vs глобальном таргете критично понимать «реальная доля юзеров из РФ vs пришедшие через VPN из других стран». Без этого нельзя сравнить эффективность гео-таргетов и принять решение о локализации.

**Context:** Vercel proxy уже добавляет `x-vercel-ip-country`, `-city`, `-region` headers в edge runtime и route handlers (бесплатно). Достаточно прочитать в `lib/analytics.ts:track()` и добавить как дополнительное измерение в ключ: `analytics:{env}:pv:DATE:{path}:{country}`. Мультиплицирует KV keys на ~10 стран — приемлемо. Сначала ввести как опциональное измерение (отдельные ключи `analytics:{env}:geo:DATE:{country}`), потом решить нужно ли cross-cut.

**Effort:** S
**Priority:** P2
**Depends on:** Initial analytics MVP merged

---

### Persistent per-user UTM attribution (требует cookie banner)

**What:** Cookie-based attribution + `utm` field на `AuthUser` для cohort retention queries («юзер пришёл из tg → купил → через 30 дней не возобновил»).

**Why:** Текущий план принял privacy-first decision: НЕТ cookie, НЕТ `user.utm`. Это даёт top-of-funnel UTM counters и event-level attribution через body field (передача `utm_source` сквозь URL params), но НЕ даёт cohort retention и LTV-per-source. Если через 6 месяцев рекламный бюджет вырастет до точки где LTV-per-source становится критическим решением — придётся пересмотреть trade-off.

**Context:** Архитектура текущего плана не блокирует это:
- Добавить опциональное поле `utm?: {source, medium, campaign, ts}` в `AuthUser` — backwards compatible
- Cookie banner перед записью cookie (РФ ФЗ-152 + ЕС PECR)
- Заполнять `user.utm` в `register/route.ts` из cookie если consent дан
- Cohort queries в `/admin/analytics` через перебор `auth:user:*` records (использовать существующий `getIndexedIds` pattern)

Trade-offs повторно открыть при пересмотре: UX-фрикция баннера vs ценность attribution; brand-impact (privacy-VPN с трекером) vs business need.

**Effort:** M (cookie banner UX + user record migration + cohort queries)
**Priority:** P4
**Depends on:** Business decision о пересмотре privacy stance. Технически НЕ blocked.

---

## Completed

<!-- moved here when shipped, with **Completed:** vX.Y.Z (YYYY-MM-DD) annotation -->
