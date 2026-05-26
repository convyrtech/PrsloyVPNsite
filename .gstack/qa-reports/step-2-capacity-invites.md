# QA Report — Step 2 (capacity counter + invite distribution + pool-full)

**Дата:** 2026-05-26
**Цель:** прод `https://www.prsloy.online`
**Тир:** Standard
**Сборка:** `faca7a1` (origin/main, deployed) vs `dd5658a` (feat/analytics, fix landed)

---

## Summary

| Метрика | Значение |
|---|---|
| Сценариев проверено | 12 |
| Багов найдено | 1 (Medium UX) |
| Багов починено | 1 |
| Console errors | 0 |
| Health score | 9/10 |

---

## Что проверялось (golden path)

### /pricing
- ✅ Счётчик «47/300 МЕСТ ЗАНЯТО» рендерится корректно
- ✅ Endpoint `/api/access/capacity` возвращает безопасные дефолты при KV-фейле
- ✅ Кнопка «получить инвайт» раскрывает CTA с двумя каналами (Telegram / email)

### Канал email
- ✅ Форма принимает email → POST `/api/access/request-via-email`
- ✅ Подтверждение: «✓ ПИСЬМО ОТПРАВЛЕНО. ПРОВЕРЬ ПОЧТУ ЧЕРЕЗ МИНУТУ.»
- ✅ Rate-limits (IP + email) активны на бэке

### Регистрация по коду
- ✅ `/register?code=QATEST-CODE` — поле email-формы (AuthForm) предзаполнено
- ⚠️ Поле инвайта в TelegramAuthButton — **НЕ** предзаполнено → **ISSUE-001**
- ✅ Невалидный код → `invite_invalid` → «Такой код не подходит.»
- ✅ `/login` — поле инвайта отсутствует (корректно для возвратного юзера)

### Пул заполнен (через fetch override)
- ✅ Таймер: «14 ДНЕЙ · 03 ЧАСОВ · 46 МИНУТ» — тикает
- ✅ Форма уведомления + VIP-эскейп «НЕ ХОЧЕШЬ ЖДАТЬ? НАПИСАТЬ ЛИЧНО»

### /dashboard (аноним)
- ✅ Показывает «НУЖЕН ВХОД» с CTA login/register

### Console + network
- ✅ 0 ошибок в консоли по всему флоу
- ✅ Все запросы 2xx/3xx

---

## ISSUE-001 — TelegramAuthButton игнорировал `?code=` из URL

**Severity:** Medium (UX-неконсистентность, не блокер)
**Симптом:** на `/register?code=ABC` поле email-формы получает значение из URL, а собственное поле инвайта внутри TelegramAuthButton — нет. Юзер, пришедший по магик-линку, видит одно заполненное поле и одно пустое.
**Причина:** компонент не читал `useSearchParams`, в отличие от AuthForm.
**Фикс:** обёртка `<Suspense>` + `useSearchParams` → передаёт `initialInviteCode` во внутренний компонент, плюс `useEffect`-синк на случай in-mount навигации.

**Файл:** `src/components/auth/TelegramAuthButton.tsx:46-82`
**Коммит:** `dd5658a` (в составе post-rebase cleanup на `feat/analytics`)

### Регрессия покрыта
- ✅ Существующий e2e Telegram happy-path (`4c326a1`) не сломан
- ✅ `npm test` — 273/273 passing
- ✅ `npm run typecheck` — clean
- ✅ `npm run build` — clean
- ✅ `npm run lint` — clean

---

## Что НЕ проверялось (out of scope)

- Marzneshin auto-issue — не подключен (ручной `/admin/grant` остаётся)
- Реальный SBP-платёж — требует продовых денег, отложено
- Платёжный callback от Platega → инкремент счётчика — покрыт unit-тестами в `payments.test.ts`, но без интеграционного прогона на проде
- A11y-аудит — не входит в standard-tier

---

## Deployment status

Фикс ISSUE-001 **уже закоммичен**, но на ветке `feat/analytics`, которая ещё не выкачена в прод. На `origin/main` (то, что обслуживает `prsloy.online`) фикса нет.

Чтобы доставить фикс в прод, нужно либо:
- **A** — закончить feat/analytics → smerge → `vercel --prod` (фикс уедет вместе с analytics-стеком, ~5–8 коммитов сверху)
- **B** — cherry-pick `dd5658a` (только TelegramAuthButton-часть, без аналитики) → main → deploy
- **C** — оставить как есть до следующего планового релиза (баг не блокирует регистрацию — юзер просто переклеивает код руками)

---

## Verdict

**DONE_WITH_CONCERNS** — все сценарии Step 2 работают на проде; найден 1 medium-баг, починен локально; ждёт решения по релизу.
