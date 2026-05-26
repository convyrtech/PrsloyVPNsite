# TODOS

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
