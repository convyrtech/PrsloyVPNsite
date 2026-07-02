# Open funnel — снятие инвайт-системы + надёжность выдачи ключей

Дата: 2026-07-02. Ветка: `feat/open-funnel` (от `fix/ad-audit-ui-copy-analytics`, 8 коммитов сохранены).
Статус-легенда: `[ ]` не начато · `[~]` в работе · `[x]` сделано и проверено.

План утверждён основателем 2026-07-02 («делай как будет лучше» — три развилки решены, см. «Решения»).
Инвентарь перепроверен пятью читающими агентами + выборочная сверка с исходниками; проект решений — deep-reasoner (Opus) + Codex независимо, сошлись по всем ключевым пунктам.

## Целевая воронка

2 действия пользователя, 3 экрана: `/pricing` (тариф → «Создать PRSLOY ID») → `/register`
(почта+пароль, сессия ставится сразу — register/route.ts:82,98) → `/pricing` (оплата СБП/USDT)
→ ключ появляется в ЛК автоматически. Гостевая оплата (почта на шаге оплаты) отклонена:
требует новую механику входа и правку живого маршрута создания платежа.

## Решения по развилкам (приняты 2026-07-02)

1. **Витрина дефицита — убрать целиком**: счётчик мест на тарифе, панель «ВСЕ МЕСТА ЗАНЯТЫ»,
   notify-when-open. Открытый сервис не торгует дефицитом. Внутренний счётчик платящих
   (`incrementPayingCounter`, payments.ts:227) и `src/lib/capacity.ts` остаются — от них зависит
   подтверждение оплаты; убираем только публичную витрину.
2. **Devlog — история остаётся**: старые записи об инвайтах не переписываем (нечестно),
   добавляем новую датированную запись об открытой регистрации.
3. **Проверка прокси** — локально переменных нет (только .env.example, проверено);
   живую проверку делает основатель командами через `!` по чек-листу из группы H.
4. **`WAITLIST_NOTIFY_EMAIL` не переименовываем** в этом заходе — его использует живой
   маршрут reissue (route.ts:71); переименование = отдельная правка с изменением env в Vercel.

## Группа A — открытая регистрация (тесты → код)

Статус: сделано 2026-07-02. Тесты: auth 36, register-route 7, telegram-claim 6, e2e 6 — зелёные;
полный прогон 33 файла / 353 теста зелёный; typecheck чист. Порядок вышел код→тесты (контракт был
зафиксирован планом, тесты переписаны четырьмя агентами параллельно и прогнаны до зелёного).

- [x] A1. Тесты переписать под новый контракт (регистрация без кода; TG-вход без кода):
      `register-route.test.ts`, `auth.test.ts` (снять invite-наборы :67-135, :411-497; убрать посев кодов),
      `telegram-claim-route.test.ts` (снять :140 и посев), `telegram-e2e-happy-path.test.ts` (снять посев пула
      :64-71,:203 и проверку сгоревшего кода :185-198). Красная планка до правок кода.
- [x] A2. `src/app/api/auth/register/route.ts`: вызов `registerUser` вместо `registerUserWithInvite` (:77),
      убрать разбор `inviteCode` (:23,:71) и ветки invite_consumed/invite_invalid в маппинге (:105-114).
- [x] A3. `src/lib/auth.ts`: `loginOrRegisterByTelegram` — убрать параметр `inviteCode` (:561-566),
      затвор invite_required (:578) и блок потребления кода (:586-604) + комментарий отката (:553-560).
      `registerUserWithInvite` пока НЕ удалять (группа F) — enable-before-delete.
- [x] A4. `src/app/api/auth/telegram/claim/route.ts`: убрать `inviteCode` из тела (:25,:69-77),
      import `MAX_INVITE_CODE_LENGTH` (:11), invite-ветки маппинга ошибок (:130-141).
- [x] A5. `src/components/auth/AuthForm.tsx`: убрать поле кода (:195-213), invite-свойства (:24-28),
      чтение `?code=` (:39-51), состояние (:63,70-71), клиентскую проверку (:109-110), `body.inviteCode` (:124),
      маппинг ошибок (:83-85,:138-140). `/register?code=…` из старых писем должен молча открываться.
- [x] A6. `src/components/auth/TelegramAuthButton.tsx`: то же (:12-16,:45-62,:74,:89-90,:140,:174-175,:220-228,:284-289).
- [x] A7. Вызовы: `register/page.tsx` (:119-123,:141-145,:74 no_code_link), `login/page.tsx` (:124-128) —
      одним коммитом с A5/A6 (свойства обязательные, иначе typecheck красный).
- [x] A8. i18n парой (ru+en): удалить `auth.invite_label..invite_consumed` (:401-405), `no_code`/`no_code_link`,
      переписать `auth.register_subtitle` (:375) без упоминания кода.
- [x] A9. Проверка: `npm run typecheck` + затронутые vitest-файлы зелёные.

## Группа B — /pricing для гостя + снятие витрины дефицита

- [x] B1. `PricingPageClient.tsx` гостевая ветка (:262-311): вместо `InviteRequest` — кнопки
      «Создать PRSLOY ID» (на /register) и «Войти» (на /login); новые i18n-ключи парой.
- [x] B2. Убрать витрину дефицита (из PricingPageClient; файлы PoolFullPanel/InviteRequest/notify-when-open
      удаляются в F — сейчас без ссылок, typecheck чист; useRiffle остаётся — им живёт AnimatedPrice): `CapacityCounter` с тарифа (:251-258), `PoolFullPanel` + состояние
      pool-full (:178-193), маршрут `/api/access/notify-when-open`, `useRiffle` — если используется только
      счётчиком (проверить перед удалением). `capacity.ts` и `/api/admin/capacity-reset` остаются.
- [x] B3. i18n парой: убрать `pricing_page.pool_full_*` (:135-150), `status_taken` (:118-119); переписать
      `guest_flow` (:102), `have_code`/`register_with_code` (:108-109) под открытую регистрацию.
- [~] B4. Проверка: typecheck зелёный; визуальный прогон `/pricing` (гость + ?__state=authed) —
      перенесён в H3, единым браузерным проходом по всей воронке.

## Группа C — привязка почты для Telegram-входа

- [ ] C1. `linkEmail(userId, email)` в `src/lib/auth.ts`: NX-резервация почты (как registerUser:205-212),
      занята → AuthError email_exists; установка email + отправка письма-подтверждения; тесты.
- [ ] C2. `POST /api/auth/link-email`: сессия обязательна, ограничение частоты, тесты по образцу
      register-route.
- [ ] C3. `PaymentCheckout.tsx`: если `user.email === null` — вместо кнопок оплаты поле «почта для чека
      и доступа к аккаунту» → POST link-email → показать оплату. Серверный затвор 409 (:67-72 create)
      остаётся защитой. Убрать мёртвое обещание в копии (:39). Ошибки 403 user_blocked / 429 показать
      внятно (сейчас падают в generic, :111-112).
- [ ] C4. i18n парой: ключи шага привязки почты.
- [ ] C5. Проверка: typecheck + тесты + dev-прогон TG-пользователем (?__state, либо тестовый аккаунт).

## Группа D — надёжность выдачи ключа

- [ ] D1. `export const maxDuration = 30` в `payments/platega/callback/route.ts` (выдача до ~21 c,
      сейчас лимита нет — окно падения).
- [ ] D2. В catch авто-выдачи (payments.ts:260-266): `order.issueError` + saveOrder (долговечная метка),
      `writeAuditEntry` (журнал админки), письмо оператору по образцу reissue
      (WAITLIST_NOTIFY_EMAIL + sendTransactionalEmail, best-effort), `track({name:"issue_failed"})`.
- [ ] D3. Восстановление: ветка в `/api/admin/reprocess` (или соседний маршрут) для «подтверждён, но без
      ключа» (`order.confirmedAt && !user.subscriptionUrl`) — повторная выдача с ИСХОДНЫМ `order.id`
      (партнёрская идемпотентность: повтор → 409 → idempotentReplay). НЕ через /api/admin/issue
      (новый payment_id → удвоение срока).
- [ ] D4. `track({name:"key_issued"})` на авто-пути (сейчас только admin-пути шлют — недоучёт).
- [ ] D5. ЛК: paidAwaiting получает кнопку поддержки (сейчас CTA нет, DashboardClient:362-366);
      состояние issueFailed по метке из /api/payments/me — честное «выпустим вручную». i18n парой.
- [ ] D6. Тесты: issueKey бросает → метка сохранена, журнал получил запись, заказ восстановим повтором
      с исходным order.id; happy-path не тронут (payments.test.ts зелёный без правок логики).

## Группа E — копирайт: открытый сервис (RU+EN строго парой)

- [ ] E1. Переписать позиционные блоки: meta (:3-6), hero.launch_strip (:15), header.status_short/full
      (:23-24), globe.metric_logs_value (:41), pricing :77,:82-83, faq.q2 (:90-91), pricing_page :97,:102-109,
      setup_page :165, dashboard_page :265,:308,:310-313 (конвейер без шага проверки приглашения),
      :327,:340,:342, faq_page :420,:427,:431-432, privacy :504, footer :600-603 (и «РУЧНАЯ ВЫДАЧА» —
      противоречит авто-выдаче). Тон: уверенно-конкретно, без «по приглашению», без дефицита,
      без имени платёжного провайдера, метод = СБП/USDT.
- [ ] E2. Удалить парой: pricing.invite_* (:120-134), faq_page «Как получить приглашение» (:456-457),
      мёртвые progress_invite/progress_email/progress_access (:311-313 — проверить, что нигде не читаются).
- [ ] E3. OG-картинка `opengraph-image.tsx:9,74` — «INVITE ONLY» → открытое позиционирование.
- [ ] E4. Devlog: новая запись об открытой регистрации (blog/page.tsx, EN+RU), старые не трогаем.
- [ ] E5. Проверка: hook i18n-парности зелёный, dev-прогон главной/тарифа/FAQ, скриншоты.

## Группа F — удаление машинерии приглашений

- [ ] F1. `auth.ts`: удалить `registerUserWithInvite` (:249-328) + import access-pool (:14-19).
- [ ] F2. Удалить: `src/lib/access-pool.ts`, `src/lib/invite-email.ts`, `src/app/api/access/request-via-email/`,
      `src/app/api/admin/access-pool/add/`, `src/components/access/InviteRequest.tsx`,
      `src/components/access/PoolFullPanel.tsx` (если не удалён в B).
- [ ] F3. Бот: `/invite` из webhook (:116-172 dispatch+handler+WELCOME_TEXT, :190-203 шаблоны),
      `parseBotMessage` invite_request из `telegram-auth.ts` (:139,:224-227,:309), env
      `TELEGRAM_INVITE_LIMIT_PER_DAY` из кода.
- [ ] F4. `links.ts`: INVITE_BOT_FALLBACK_URL + мёртвый комментарий getInviteBotUrl (:4-8).
- [ ] F5. Тесты: удалить `access-pool.test.ts`; в `admin-mutation-ratelimit.test.ts` убрать только набор
      access-pool/add (:107-126 — файл покрывает и другие маршруты!); подчистить telegram-auth.test.ts
      (:181-223).
- [ ] F6. Проверка: typecheck + полный `npm test` + `npm run build`.

## Группа G — документы

- [ ] G1. CLAUDE.md + AGENTS.md синхронно: §10 стек (:163 инвайты), §11.4 (СБП+USDT — снять «SBP-only»),
      §11.10 (бот = вход, лист ожидания мёртв), §13 запись о снятии инвайтов.
- [ ] G2. CONTEXT.md: открытая регистрация (:3,:10), термин Waitlist (:25-26), Method (USDT живой),
      Ключ (авто-выдача с ручным запасным путём — снять «issued manually»).
- [ ] G3. README.md: разделы об инвайтах (:3,:14,:38-41,:64,:83,:98,:120-125,:169).
- [ ] G4. TODOS.md: закрыть строку 102 (снятие «по приглашению»), убрать /access-pool/* из :28.

## Группа H — финальная проверка и выкат

- [ ] H1. Полный прогон: `npm run typecheck` + `npm run lint` + `npm test` + `npm run build` — всё зелёное.
- [ ] H2. Ревью диффа скилом /code-review; найденное исправить.
- [ ] H3. Прогон воронки в браузере (chrome-devtools): гость → регистрация → тариф → (dev-имитация
      оплаты ?__state) → ЛК; консоль без ошибок.
- [ ] H4. Чек-лист основателю: живая проверка прокси и «ключ подключается» (команды через `!`,
      без адресов/идентификаторов в чате) + `vercel --prod`.
- [ ] H5. Память проекта: обновить funnel-simplification (сделано), scarcity-framing (устарело для
      воронки), invite-term (термин уходит из копирайта), critical-ui-audit (противоречие копии закрыто).

## Хвосты после выката (не блокируют)

- [ ] KV: почистить `access:pool:*`, `access:notify-list`, ограничители `invite-email*` в Upstash.
- [ ] Vercel env: удалить `TELEGRAM_INVITE_LIMIT_PER_DAY`; решить судьбу имени WAITLIST_NOTIFY_EMAIL.
- [ ] `/api/auth/verify?verified=1|0` — ЛК не показывает результат подтверждения почты (мелочь, отдельно).
- [ ] Настоящий отзыв ключа — конечная точка на прокси-сервере (отдельный заход, бэкенд).
- [ ] paidAwaiting при сбое KV показывает «оплатить» (риск двойной покупки, DashboardClient:128-140) — отдельно.
