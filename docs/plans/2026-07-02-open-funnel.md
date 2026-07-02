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

- [x] C1. `linkEmail(userId, email)` в `src/lib/auth.ts`: NX-резервация почты, занята → email_exists,
      уже есть почта → email_already_set, откат резервации при сбое сохранения. Тесты: 5 случаев.
- [x] C2. `POST /api/auth/link-email`: сессия, ограничение 5/час, письмо-подтверждение best-effort.
      Тесты: 7 случаев (итого 48 зелёных по двум файлам).
- [x] C3. `PaymentCheckout.tsx`: при `emailMissing` вместо кнопок оплаты — поле «ПОЧТА ДЛЯ ЧЕКА»
      → link-email → кнопки; email_already_set трактуется как успех; копия 409 переписана.
      Копия компонента — встроенный COPY-объект (ru+en), messages не задействованы.
- [x] C4. Признак с тарифной: `PricingPageClient` читает email из /api/auth/me, передаёт
      `emailMissing`; dev-состояние `?__state=authed-noemail` для визуальной проверки.
- [~] C5. Проверка: typecheck + 48 тестов зелёные; визуальный прогон — в H3.
      Замечание: внятные тексты для user_blocked/429 в checkout НЕ делались (не блокирует; хвост).

## Группа D — надёжность выдачи ключа

- [x] D1. `export const maxDuration = 30` на callback-маршруте (окно падения закрыто).
- [x] D2. Выдача вынесена в `issueKeyForOrder(order)`; catch → `reportAutoIssueFailure`:
      `order.issueError` + saveOrder, `writeAuditEntry(action:"auto_issue", result:"error")`,
      письмо оператору (WAITLIST_NOTIFY_EMAIL, best-effort), `track issue_failed`.
- [x] D3. `/api/admin/reprocess`: ветка «подтверждён, но без ключа» → `issueKeyForOrder` с исходным
      `order.id`; ответ дополнен `reissued`/`reissueError`; журнал пишет исход.
- [x] D4. `key_issued` отправляется на авто-пути (внутри issueKeyForOrder).
- [x] D5. ЛК: кнопка поддержки в герое была всегда (проверено, DashboardClient:403-412); добавлено
      состояние issueFailed (метка из /api/payments/me → честное «выдадим вручную», тон warning),
      dev-состояние `?__state=issue-failed`; i18n парой (status_issue_failed_title/body).
- [x] D6. Тесты: 24/24 в payments.test.ts + admin-reprocess-route.test.ts (сбой выдачи → метка,
      журнал, письмо оператору, issue_failed; восстановление через reprocess → reissued:true,
      повтор — no-op; сбой восстановления → reissueError + журнал с ошибкой). Полный набор 345/345.

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

- [x] F1. `auth.ts`: `registerUserWithInvite` + import access-pool удалены.
- [x] F2. Удалены: access-pool.ts, invite-email.ts, request-via-email/, admin/access-pool/,
      InviteRequest.tsx, PoolFullPanel.tsx, notify-when-open/, access/capacity/ (потребителей нет),
      access-pool.test.ts, пустая папка components/access/. В scripts/smoke.sh снята проверка
      /api/access/capacity.
- [x] F3. Бот: /invite убран из webhook (+ осиротевшие getSiteUrl/ruPlural), WELCOME_TEXT переписан
      под вход; parseBotMessage без invite_request; TELEGRAM_INVITE_LIMIT_PER_DAY выпилен из кода.
- [x] F4. `links.ts`: INVITE_BOT_FALLBACK_URL удалён (ссылок ноль).
- [x] F5. Тесты подчищены (telegram-auth 2 смежных случая переведены на «/start» — их смысл был
      про chatId, не про приглашения); admin-mutation-ratelimit: удалён только набор access-pool.
- [x] F6. Sweep по 15 маркерам — ноль вхождений; typecheck чист (после сброса устаревшего .next),
      80 тестов в трёх затронутых файлах зелёные. Полный test+build — в H1.

## Группа G — документы

- [x] G1. CLAUDE.md + AGENTS.md синхронно: стек (Auth/Payments), Forbidden (СБП+USDT; авто-выдача
      с восстановлением через reprocess вместо «issued manually»), §11.4, §11.10, §13 запись.
- [x] G2. CONTEXT.md: открытая регистрация, термин Waitlist удалён, Method (СБП+USDT), Ключ
      (авто-выдача + issueError + reprocess), Grant = исключение, диалог-пример обновлён,
      PRSLOY ID упоминает привязку почты для Telegram-аккаунтов.
- [x] G3. README.md: интро, маршруты (без счётчика/панели приглашений; +link-email, +reprocess/issue),
      раздел «Invite codes» удалён, «Manual VPN grant» → «Key issuance» (авто + восстановление +
      ручной запасной), Telegram-раздел без /invite, WAITLIST_NOTIFY_EMAIL задокументирован.
- [x] G4. TODOS.md: /access-pool/* убран из перечня админ-surface; Marketing voice audit помечен
      выполненным (2026-07-02).

## Группа H — финальная проверка и выкат

- [x] H1. Полный прогон: typecheck + lint + 346/346 тестов + build — всё зелёное (после правок ревью).
- [x] H2. Ревью. /code-review-воркфлоу вернул пустой результат из-за лимита сессии (все искатели
      упали) — НЕ засчитан. Вместо него: Codex-ревью диффа (независимая квота) + свой проход по
      диффу денежного пути. Находки Codex: (1) СРЕДНЯЯ — гонка в linkEmail: два параллельных
      запроса с разными адресами осиротят индекс почты → исправлено NX-замком на пользователя
      (auth:linkemail:lock, TTL 10 c, код link_in_progress → 409) + тест на гонку; (2) НИЗКАЯ —
      issue_failed не попадал в счётчики воронки → добавлена ветка в track(); (3) НИЗКАЯ —
      открытая регистрация возвращает email_exists → оракул существования почты. ПРИНЯТО
      ОСОЗНАННО: без этого форма не может сказать «войди вместо регистрации»; перебор ограничен
      5/час на IP (failClosed). Пересмотреть, если станет проблемой.
- [x] H3. Браузерный прогон: /pricing гость (заголовок, CTA регистрации, без счётчика/панели),
      ?__state=authed (кнопки СБП/USDT), ?__state=authed-noemail (шаг «ПОЧТА ДЛЯ ЧЕКА»),
      /dashboard?__state=issue-failed (честный герой + поддержка). Консоль: только ожидаемый 401
      от принудительных dev-состояний. Smoke: все 20 страниц RU+EN отвечают 200 (словари целы).
- [x] H4. Чек-лист живой проверки выдан основателю в чате (проверка прокси, тестовая покупка,
      подключение ключа — без адресов и идентификаторов).
- [x] H5. Память обновлена: funnel-simplification (выполнено, коммиты), scarcity-framing
      (устарело для витрины), invite-term (термин мёртв), + новые записи execution-discipline
      и nothing-design-skill.

## Хвосты после выката (не блокируют)

- [ ] Оракул существования почты на /api/auth/register (email_exists → 409) — осознанный компромисс
      открытой регистрации (см. H2.3); пересмотреть при признаках перебора.
- [ ] Внятные тексты для user_blocked/429 в PaymentCheckout (сейчас падают в общий текст ошибки).

- [ ] KV: почистить `access:pool:*`, `access:notify-list`, ограничители `invite-email*` в Upstash.
- [ ] Vercel env: удалить `TELEGRAM_INVITE_LIMIT_PER_DAY`; решить судьбу имени WAITLIST_NOTIFY_EMAIL.
- [ ] `/api/auth/verify?verified=1|0` — ЛК не показывает результат подтверждения почты (мелочь, отдельно).
- [ ] Настоящий отзыв ключа — конечная точка на прокси-сервере (отдельный заход, бэкенд).
- [ ] paidAwaiting при сбое KV показывает «оплатить» (риск двойной покупки, DashboardClient:128-140) — отдельно.
