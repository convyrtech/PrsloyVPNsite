"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import {
  clearStoredAdminSecret,
  getStoredAdminSecret,
  storeAdminSecret,
} from "@/lib/admin-secret-storage";
import { displayIdentity } from "@/lib/identity";

type Period = "1mo" | "6mo" | "1yr";

type CardUser = {
  id: string;
  email: string | null;
  emailVerified: boolean;
  accessStatus: string;
  vpnSlug: string | null;
  subscriptionUrl: string | null;
  telegramId: string | null;
  telegramUsername: string | null;
  createdAt: string;
  updatedAt: string;
};

type Subscription = {
  issuedAt: string;
  periodDays: number;
  source: string;
};

type Card = {
  identifier: string; // the value that resolved this user — reused on refresh
  user: CardUser;
  subscription: Subscription | null;
};

type Flash = { kind: "success" | "error"; message: string };

type AdminGrantCopy = {
  navUsers: string;
  navGrant: string;
  navAnalytics: string;
  backToUsers: string;
  title: string;
  subtitle: string;
  operator: string;
  grant: string;
  steps: string[];
  // search
  searchTitle: string;
  searchLabel: string;
  searchPlaceholder: string;
  searching: string;
  find: string;
  // card identity
  cardTitle: string;
  fieldId: string;
  fieldVerified: string;
  fieldCreated: string;
  verifiedYes: string;
  verifiedPending: string;
  statusActive: string;
  statusPending: string;
  statusBlocked: string;
  // key block
  keyTitle: string;
  keyNone: string;
  keyExpiry: string;
  keyApprox: string;
  keyDaysLeft: (n: number) => string;
  keyDaysAgo: (n: number) => string;
  sourceAuto: string;
  sourceManual: string;
  show: string;
  hide: string;
  copy: string;
  copied: string;
  copyError: string;
  // issue
  issueTitle: string;
  periodLabel: string;
  periodLabels: Record<Period, string>;
  compLabel: string;
  compHint: string;
  noteLabel: string;
  notePlaceholderComp: string;
  notePlaceholder: string;
  noteRequired: string;
  issue: string;
  extend: string;
  issuing: string;
  needEmailToIssue: string;
  needUnblockToIssue: string;
  confirmIssue: (identity: string, period: string, comp: boolean) => string;
  okIssued: string;
  okExtended: string;
  // block
  moderationTitle: string;
  moderationHint: string;
  block: string;
  unblock: string;
  blocking: string;
  confirmBlock: (identity: string) => string;
  confirmUnblock: (identity: string) => string;
  okBlocked: string;
  okUnblocked: string;
  // manual fallback
  manualToggle: string;
  manualHint: string;
  manualLabel: string;
  attach: string;
  attaching: string;
  okManual: string;
  // misc
  newSearch: string;
  notes: Array<{ title: string; body: string }>;
  errors: Record<string, string>;
};

const COPY: Record<"ru" | "en", AdminGrantCopy> = {
  ru: {
    navUsers: "Пользователи",
    navGrant: "Выдать доступ",
    navAnalytics: "Аналитика",
    backToUsers: "К списку пользователей",
    title: "Доступ.",
    subtitle:
      "Найди PRSLOY ID по email — выдай или продли ключ, заблокируй доступ или привяжи ссылку вручную. Ключ выдаётся тем же механизмом, что и при оплате.",
    operator: "Оператор",
    grant: "Доступ",
    steps: ["Найти", "Действие", "Проверить"],
    searchTitle: "Поиск",
    searchLabel: "Email, @telegram или Telegram ID",
    searchPlaceholder: "user@mail.ru",
    searching: "Ищем...",
    find: "Найти",
    cardTitle: "Карточка доступа",
    fieldId: "PRSLOY ID",
    fieldVerified: "Почта",
    fieldCreated: "Создан",
    verifiedYes: "подтверждена",
    verifiedPending: "ждёт подтверждения",
    statusActive: "активен",
    statusPending: "ожидает",
    statusBlocked: "заблокирован",
    keyTitle: "Ключ",
    keyNone: "Ключ ещё не выдан.",
    keyExpiry: "Срок",
    keyApprox: "приблизительно",
    keyDaysLeft: (n) => `≈ ${n} дн. осталось`,
    keyDaysAgo: (n) => `истёк ${n} дн. назад`,
    sourceAuto: "по оплате",
    sourceManual: "вручную",
    show: "Показать",
    hide: "Скрыть",
    copy: "Скопировать",
    copied: "Скопировано",
    copyError: "Не получилось скопировать. Выдели вручную.",
    issueTitle: "Выдать / продлить",
    periodLabel: "Период",
    periodLabels: { "1mo": "1 месяц", "6mo": "6 месяцев", "1yr": "12 месяцев" },
    compLabel: "Комп — без оплаты",
    compHint: "Бесплатная выдача. Заметка обязательна — попадёт в аудит.",
    noteLabel: "Заметка / причина",
    notePlaceholderComp: "напр. триал 7 дней, извинение за простой",
    notePlaceholder: "необязательно для оплаченной выдачи",
    noteRequired: "Для комп-выдачи нужна заметка.",
    issue: "Выдать",
    extend: "Продлить",
    issuing: "Выдаём...",
    needEmailToIssue:
      "У аккаунта нет email — выдача идёт только по email. Можно заблокировать или привязать ссылку вручную.",
    needUnblockToIssue:
      "Аккаунт заблокирован — сначала разблокируй, потом выдавай ключ.",
    confirmIssue: (identity, period, comp) =>
      `${comp ? "КОМП (бесплатно). " : ""}Выдать ключ на «${period}» для ${identity}?`,
    okIssued: "Ключ выдан.",
    okExtended: "Ключ продлён.",
    moderationTitle: "Модерация",
    moderationHint:
      "Блок прячет ключ в ЛК пользователя. Конфиг в Marzneshin остаётся жив — это не отзыв (отзыв будет в Фазе 2).",
    block: "Заблокировать (скрыть у себя)",
    unblock: "Разблокировать",
    blocking: "Применяем...",
    confirmBlock: (identity) => `Заблокировать доступ ${identity}? Ключ скроется в ЛК.`,
    confirmUnblock: (identity) => `Разблокировать доступ ${identity}?`,
    okBlocked: "Доступ заблокирован.",
    okUnblocked: "Доступ разблокирован.",
    manualToggle: "Привязать ссылку вручную",
    manualHint:
      "Фолбэк, если автоматическая выдача недоступна. Вставь готовую subscription/config ссылку.",
    manualLabel: "VPN subscription/config URL",
    attach: "Привязать",
    attaching: "Привязываем...",
    okManual: "Ссылка привязана.",
    newSearch: "Новый поиск",
    notes: [
      {
        title: "Аккаунт уже должен быть",
        body: "Пользователь сначала создаёт PRSLOY ID. Эта форма не регистрирует аккаунты.",
      },
      {
        title: "Комп = бесплатно",
        body: "Комп-выдача не требует оплаты, но обязательна заметка — она уходит в аудит-лог.",
      },
      {
        title: "Блок ≠ отзыв",
        body: "Блок прячет ключ у пользователя, но конфиг ещё жив. Настоящий отзыв — Фаза 2.",
      },
    ],
    errors: {
      unauthorized: "Неверный ADMIN_SECRET.",
      not_found: "Админ endpoint отключён. Добавь ADMIN_SECRET в Vercel env.",
      identifier_required: "Введи email, @telegram или Telegram ID.",
      invalid_identifier: "Идентификатор выглядит неверно.",
      user_not_found: "Нет аккаунта с таким идентификатором.",
      user_blocked: "Аккаунт заблокирован. Сначала сними блокировку, потом выдавай ключ.",
      invalid_email: "Email выглядит неверно.",
      period_required: "Выбери период.",
      invalid_period: "Неверный период.",
      note_required_for_comp: "Для комп-выдачи нужна заметка.",
      user_id_required: "Не выбран аккаунт.",
      blocked_required: "Не задано действие блокировки.",
      subscription_url_required: "Нужна subscription/config ссылка.",
      invalid_subscription_url: "Нужен поддерживаемый subscription URL или config URI.",
      proxy_not_configured: "Выдача ключей не настроена (нет MARZNESHIN_PROXY_URL).",
      proxy_bad_signature: "Бэкенд отклонил подпись. Проверь общий секрет.",
      proxy_bad_request: "Бэкенд выдачи отклонил запрос.",
      proxy_upstream_failure: "Бэкенд выдачи недоступен. Попробуй позже.",
      proxy_malformed_response: "Бэкенд вернул некорректный ответ.",
      kv_not_configured: "Хранилище аккаунтов не настроено.",
      auth_secret_not_configured: "AUTH_SECRET не настроен.",
      invalid_json: "Неверное тело запроса.",
      issue_failed: "Выдача не прошла. Проверь server logs.",
      grant_failed: "Привязка не прошла. Проверь server logs.",
      access_failed: "Не удалось изменить доступ. Проверь server logs.",
      lookup_failed: "Поиск не прошёл. Проверь server logs.",
      unknown: "Неизвестная ошибка админки.",
      network: "Ошибка сети.",
    },
  },
  en: {
    navUsers: "Users",
    navGrant: "Grant access",
    navAnalytics: "Analytics",
    backToUsers: "Back to users",
    title: "Access.",
    subtitle:
      "Find a PRSLOY ID by email — issue or extend a key, block access, or attach a URL by hand. Issuing runs through the same key issuance as a payment.",
    operator: "Operator",
    grant: "Access",
    steps: ["Find", "Act", "Verify"],
    searchTitle: "Search",
    searchLabel: "Email, @telegram, or Telegram ID",
    searchPlaceholder: "user@mail.com",
    searching: "Searching...",
    find: "Find",
    cardTitle: "Access card",
    fieldId: "PRSLOY ID",
    fieldVerified: "Email",
    fieldCreated: "Created",
    verifiedYes: "verified",
    verifiedPending: "pending",
    statusActive: "active",
    statusPending: "pending",
    statusBlocked: "blocked",
    keyTitle: "Key",
    keyNone: "No key issued yet.",
    keyExpiry: "Expires",
    keyApprox: "approximate",
    keyDaysLeft: (n) => `≈ ${n} days left`,
    keyDaysAgo: (n) => `expired ${n} days ago`,
    sourceAuto: "from payment",
    sourceManual: "manual",
    show: "Show",
    hide: "Hide",
    copy: "Copy",
    copied: "Copied",
    copyError: "Could not copy. Select the URL manually.",
    issueTitle: "Issue / extend",
    periodLabel: "Period",
    periodLabels: { "1mo": "1 month", "6mo": "6 months", "1yr": "12 months" },
    compLabel: "Comp — no payment",
    compHint: "Free issuance. A note is required — it goes to the audit log.",
    noteLabel: "Note / reason",
    notePlaceholderComp: "e.g. 7-day trial, apology for downtime",
    notePlaceholder: "optional for paid issuance",
    noteRequired: "A comp issuance needs a note.",
    issue: "Issue",
    extend: "Extend",
    issuing: "Issuing...",
    needEmailToIssue:
      "This account has no email — issuing is email-only. You can still block it or attach a URL by hand.",
    needUnblockToIssue:
      "Account is blocked — unblock it first, then issue a key.",
    confirmIssue: (identity, period, comp) =>
      `${comp ? "COMP (free). " : ""}Issue a key for "${period}" to ${identity}?`,
    okIssued: "Key issued.",
    okExtended: "Key extended.",
    moderationTitle: "Moderation",
    moderationHint:
      "Block hides the key in the user's dashboard. The Marzneshin config stays alive — this is not a revoke (revoke is Phase 2).",
    block: "Block (hide on our side)",
    unblock: "Unblock",
    blocking: "Applying...",
    confirmBlock: (identity) => `Block access for ${identity}? The key will be hidden in their dashboard.`,
    confirmUnblock: (identity) => `Unblock access for ${identity}?`,
    okBlocked: "Access blocked.",
    okUnblocked: "Access unblocked.",
    manualToggle: "Attach a URL by hand",
    manualHint:
      "Fallback when automatic issuing is unavailable. Paste a ready subscription/config URL.",
    manualLabel: "VPN subscription/config URL",
    attach: "Attach",
    attaching: "Attaching...",
    okManual: "URL attached.",
    newSearch: "New search",
    notes: [
      {
        title: "Existing account",
        body: "The user must create a PRSLOY ID first. This tool does not register accounts.",
      },
      {
        title: "Comp = free",
        body: "A comp issuance needs no payment but requires a note — it goes to the audit log.",
      },
      {
        title: "Block ≠ revoke",
        body: "Block hides the key from the user, but the config is still live. A real revoke is Phase 2.",
      },
    ],
    errors: {
      unauthorized: "Wrong ADMIN_SECRET.",
      not_found: "Admin endpoint is disabled. Add ADMIN_SECRET in Vercel env.",
      identifier_required: "Enter an email, @telegram, or Telegram ID.",
      invalid_identifier: "That identifier looks invalid.",
      user_not_found: "No account matches that identifier.",
      user_blocked: "The account is blocked. Unblock it before issuing a key.",
      invalid_email: "Email looks invalid.",
      period_required: "Choose a period.",
      invalid_period: "Invalid period.",
      note_required_for_comp: "A comp issuance needs a note.",
      user_id_required: "No account selected.",
      blocked_required: "No block action specified.",
      subscription_url_required: "Subscription/config URL is required.",
      invalid_subscription_url: "Use a supported subscription URL or config URI.",
      proxy_not_configured: "Key issuing is not configured (MARZNESHIN_PROXY_URL missing).",
      proxy_bad_signature: "The backend rejected the signature. Check the shared secret.",
      proxy_bad_request: "The issuing backend rejected the request.",
      proxy_upstream_failure: "The issuing backend is unavailable. Try again later.",
      proxy_malformed_response: "The backend returned a malformed response.",
      kv_not_configured: "Account storage is not configured.",
      auth_secret_not_configured: "AUTH_SECRET is not configured.",
      invalid_json: "Invalid request body.",
      issue_failed: "Issue failed. Check server logs.",
      grant_failed: "Attach failed. Check server logs.",
      access_failed: "Could not change access. Check server logs.",
      lookup_failed: "Lookup failed. Check server logs.",
      unknown: "Unknown admin error.",
      network: "Network error.",
    },
  },
};

const MS_PER_DAY = 86_400_000;

export function AdminGrantClient({ locale }: { locale: string }) {
  const copy = getCopy(locale);
  const searchParams = useSearchParams();
  const [secret, setSecret] = useState("");
  const [identifier, setIdentifier] = useState(() => {
    const raw =
      searchParams.get("identifier") ?? searchParams.get("email") ?? "";
    return raw.trim();
  });
  const [searching, setSearching] = useState(false);
  const [card, setCard] = useState<Card | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill the secret from sessionStorage after hydration so server and
  // client render the same empty input on first paint.
  useEffect(() => {
    const stored = getStoredAdminSecret();
    if (stored) setSecret(stored);
  }, []);

  // Single fetch helper: attaches the Bearer secret, parses JSON, and clears
  // the stored secret on 401 so a rotated secret doesn't get re-sent.
  const call = useCallback(
    async (
      method: string,
      path: string,
      body?: unknown
    ): Promise<{ ok: boolean; data: Record<string, unknown> }> => {
      const trimmedSecret = secret.trim();
      const res = await fetch(path, {
        method,
        headers: {
          Authorization: `Bearer ${trimmedSecret}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        cache: "no-store",
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;
      if (res.status === 401) clearStoredAdminSecret();
      if (res.ok && data.ok) storeAdminSecret(trimmedSecret);
      return { ok: res.ok && data.ok === true, data };
    },
    [secret]
  );

  const errorText = useCallback(
    (code: unknown) =>
      copy.errors[typeof code === "string" ? code : ""] || copy.errors.unknown,
    [copy]
  );

  async function lookup(value: string) {
    const id = value.trim();
    if (!id) {
      setError(copy.errors.identifier_required);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const { ok, data } = await call(
        "GET",
        `/api/admin/lookup?identifier=${encodeURIComponent(id)}`
      );
      if (!ok) {
        setError(errorText(data.error));
        return;
      }
      setCard({
        identifier: id,
        user: data.user as CardUser,
        subscription: (data.subscription as Subscription | null) ?? null,
      });
    } catch {
      setError(copy.errors.network);
    } finally {
      setSearching(false);
    }
  }

  // Re-fetch the active card after a mutation so status/key/expiry stay
  // truthful. Best-effort: the mutation already succeeded, so a transient
  // refresh failure must not wipe the card.
  const refresh = useCallback(async () => {
    if (!card) return;
    try {
      const { ok, data } = await call(
        "GET",
        `/api/admin/lookup?identifier=${encodeURIComponent(card.identifier)}`
      );
      if (ok && data.user) {
        setCard((prev) =>
          prev
            ? {
                ...prev,
                user: data.user as CardUser,
                subscription: (data.subscription as Subscription | null) ?? null,
              }
            : prev
        );
      }
    } catch {
      // keep the existing card
    }
  }, [card, call]);

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-6xl mx-auto px-lg flex flex-col gap-2xl">
        <AdminNav copy={copy} active="grant" />

        <header className="grid gap-xl lg:grid-cols-[1fr_320px] lg:items-end">
          <div className="flex flex-col gap-md">
            <p className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              PRSLOY ADMIN
            </p>
            <h1
              className="font-body font-bold text-text-display leading-[0.98]"
              style={{ fontSize: "clamp(40px, 7vw, 84px)" }}
            >
              {copy.title}
            </h1>
            <p className="max-w-2xl font-body text-body text-text-secondary leading-[1.65]">
              {copy.subtitle}
            </p>
          </div>

          <section className="border border-border-visible rounded-[8px] bg-surface p-lg flex flex-col gap-md">
            <div className="flex items-center justify-between gap-md font-mono text-label uppercase tracking-[0.14em]">
              <span className="text-text-disabled">{copy.operator}</span>
              <span className="text-text-display">{copy.grant}</span>
            </div>
            <div className="grid grid-cols-3 gap-sm">
              {copy.steps.map((item, index) => (
                <div key={item} className="border border-border-visible bg-black p-sm">
                  <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-text-disabled">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-xs font-mono text-label uppercase tracking-[0.08em] text-text-display">
                    {item}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </header>

        <SearchForm
          copy={copy}
          secret={secret}
          setSecret={setSecret}
          identifier={identifier}
          setIdentifier={setIdentifier}
          searching={searching}
          onSearch={() => lookup(identifier)}
        />

        {error && !card && (
          <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
            {error}
          </p>
        )}

        {card && (
          <AccessCard
            key={card.user.id}
            card={card}
            copy={copy}
            locale={locale}
            call={call}
            errorText={errorText}
            refresh={refresh}
            onClose={() => {
              setCard(null);
              setError(null);
            }}
          />
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-md">
          {copy.notes.map((note, index) => (
            <AdminNote
              key={note.title}
              index={String(index + 1).padStart(2, "0")}
              title={note.title}
              body={note.body}
            />
          ))}
        </section>
      </div>
    </main>
  );
}

function SearchForm({
  copy,
  secret,
  setSecret,
  identifier,
  setIdentifier,
  searching,
  onSearch,
}: {
  copy: AdminGrantCopy;
  secret: string;
  setSecret: (v: string) => void;
  identifier: string;
  setIdentifier: (v: string) => void;
  searching: boolean;
  onSearch: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!searching) onSearch();
      }}
      className="border border-border-visible rounded-[8px] p-xl sm:p-2xl bg-surface flex flex-col gap-lg"
    >
      <div className="flex items-center gap-md border-b border-border-visible pb-lg">
        <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {copy.searchTitle}
        </span>
        <span className="h-px flex-1 bg-border-visible/40" />
      </div>

      <AdminInput
        label="ADMIN_SECRET"
        type="password"
        value={secret}
        onChange={setSecret}
        autoComplete="off"
      />
      <AdminInput
        label={copy.searchLabel}
        type="text"
        value={identifier}
        onChange={setIdentifier}
        placeholder={copy.searchPlaceholder}
        autoComplete="off"
      />

      <button
        type="submit"
        disabled={searching}
        className="mt-sm self-start bg-text-display text-black font-mono uppercase tracking-[0.08em]
                   px-xl min-h-[48px] inline-flex items-center justify-center rounded-full text-label
                   hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait
                   transition duration-150 ease-out-nothing"
      >
        [ {searching ? copy.searching : copy.find} ]
      </button>
    </form>
  );
}

function AccessCard({
  card,
  copy,
  locale,
  call,
  errorText,
  refresh,
  onClose,
}: {
  card: Card;
  copy: AdminGrantCopy;
  locale: string;
  call: (
    method: string,
    path: string,
    body?: unknown
  ) => Promise<{ ok: boolean; data: Record<string, unknown> }>;
  errorText: (code: unknown) => string;
  refresh: () => Promise<void>;
  onClose: () => void;
}) {
  const { user } = card;
  const isBlocked = user.accessStatus === "blocked";
  const hasKey = Boolean(user.subscriptionUrl);
  const identity = displayIdentity(user);

  // issue inputs. Only the 1/6/12-month presets are offered: the partner's
  // /external/issue-key rejects non-standard period_days (custom comp days
  // 400 in prod), so arbitrary-day issuance is withheld until the partner
  // accepts it. See docs/admin-design.md §10.1.
  const [period, setPeriod] = useState<Period>("1mo");
  const [comp, setComp] = useState(false);
  const [note, setNote] = useState("");

  // manual fallback
  const [manualOpen, setManualOpen] = useState(false);
  const [manualUrl, setManualUrl] = useState("");

  const [pending, setPending] = useState<"issue" | "block" | "manual" | null>(
    null
  );
  const [flash, setFlash] = useState<Flash | null>(null);

  const compNoteMissing = comp && !note.trim();
  // A blocked account must be unblocked before issuing (spec §8/§10.3). The
  // server enforces this too (409), but the affordance shouldn't invite a
  // guaranteed-fail click.
  const issueLocked = pending !== null || !user.email || isBlocked;
  const issueDisabled = issueLocked || compNoteMissing;

  const periodText = copy.periodLabels[period];

  async function doIssue() {
    if (issueDisabled || !user.email) return;
    if (!window.confirm(copy.confirmIssue(identity, periodText, comp))) return;
    setPending("issue");
    setFlash(null);
    const trimmedNote = note.trim();
    try {
      const { ok, data } = await call("POST", "/api/admin/issue", {
        email: user.email,
        period,
        comp,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      if (!ok) {
        setFlash({ kind: "error", message: errorText(data.error) });
        return;
      }
      setFlash({
        kind: "success",
        message: data.action === "extend" ? copy.okExtended : copy.okIssued,
      });
      setNote("");
      await refresh();
    } catch {
      setFlash({ kind: "error", message: copy.errors.network });
    } finally {
      setPending(null);
    }
  }

  async function doBlock() {
    const next = !isBlocked;
    if (
      !window.confirm(
        next ? copy.confirmBlock(identity) : copy.confirmUnblock(identity)
      )
    ) {
      return;
    }
    setPending("block");
    setFlash(null);
    try {
      const { ok, data } = await call("PATCH", "/api/admin/access", {
        userId: user.id,
        blocked: next,
      });
      if (!ok) {
        setFlash({ kind: "error", message: errorText(data.error) });
        return;
      }
      setFlash({
        kind: "success",
        message: next ? copy.okBlocked : copy.okUnblocked,
      });
      await refresh();
    } catch {
      setFlash({ kind: "error", message: copy.errors.network });
    } finally {
      setPending(null);
    }
  }

  async function doManual() {
    const url = manualUrl.trim();
    const localError = validateSubscriptionUrl(url, copy);
    if (localError) {
      setFlash({ kind: "error", message: localError });
      return;
    }
    setPending("manual");
    setFlash(null);
    try {
      const { ok, data } = await call("POST", "/api/admin/grant", {
        identifier: canonicalIdentifier(user),
        subscriptionUrl: url,
      });
      if (!ok) {
        setFlash({ kind: "error", message: errorText(data.error) });
        return;
      }
      setFlash({ kind: "success", message: copy.okManual });
      setManualUrl("");
      setManualOpen(false);
      await refresh();
    } catch {
      setFlash({ kind: "error", message: copy.errors.network });
    } finally {
      setPending(null);
    }
  }

  return (
    <section className="border border-border-visible rounded-[8px] bg-surface flex flex-col">
      {/* identity header */}
      <div className="flex flex-wrap items-center justify-between gap-md border-b border-border-visible p-xl">
        <div className="flex items-center gap-md">
          <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
            {copy.cardTitle}
          </span>
          <StatusBadge status={user.accessStatus} copy={copy} />
        </div>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-label uppercase tracking-[0.08em] text-text-secondary hover:text-text-display transition-colors"
        >
          {copy.newSearch} {"←"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr]">
        {/* left: identity + key */}
        <div className="flex flex-col gap-lg p-xl lg:border-r border-border-visible">
          <div className="font-body font-bold text-text-display text-heading break-all leading-[1.1]">
            {identity}
          </div>
          <div className="flex flex-col">
            <CardRow label={copy.fieldId} value={shortId(user.id)} mono />
            <CardRow
              label={copy.fieldVerified}
              value={user.emailVerified ? copy.verifiedYes : copy.verifiedPending}
            />
            <CardRow
              label={copy.fieldCreated}
              value={formatAdminDate(user.createdAt, locale)}
            />
          </div>

          <div className="flex flex-col gap-sm border border-border-visible bg-black p-md">
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              {copy.keyTitle}
            </span>
            {hasKey ? (
              <KeyReveal url={user.subscriptionUrl!} copy={copy} />
            ) : (
              <span className="font-body text-body-sm text-text-secondary">
                {copy.keyNone}
              </span>
            )}
            {hasKey && card.subscription && (
              <ExpiryLine
                subscription={card.subscription}
                copy={copy}
                locale={locale}
              />
            )}
          </div>
        </div>

        {/* right: actions */}
        <div className="flex flex-col gap-lg p-xl">
          {/* issue / extend */}
          <div className="flex flex-col gap-md">
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
              {copy.issueTitle}
            </span>

            {!user.email && (
              <p className="font-body text-body-sm text-warning leading-[1.5]">
                {copy.needEmailToIssue}
              </p>
            )}
            {user.email && isBlocked && (
              <p className="font-body text-body-sm text-warning leading-[1.5]">
                {copy.needUnblockToIssue}
              </p>
            )}

            <PeriodPicker
              copy={copy}
              period={period}
              disabled={issueLocked}
              onPreset={setPeriod}
            />

            <label className="flex items-center gap-sm cursor-pointer">
              <input
                type="checkbox"
                checked={comp}
                disabled={issueLocked}
                onChange={(e) => setComp(e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              <span className="font-mono text-label uppercase tracking-[0.08em] text-text-display">
                {copy.compLabel}
              </span>
            </label>
            {comp && (
              <p className="font-body text-body-sm text-text-secondary leading-[1.5]">
                {copy.compHint}
              </p>
            )}

            <label className="flex flex-col gap-xs">
              <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
                {copy.noteLabel}
              </span>
              <textarea
                rows={2}
                value={note}
                disabled={issueLocked}
                placeholder={comp ? copy.notePlaceholderComp : copy.notePlaceholder}
                onChange={(e) => setNote(e.target.value)}
                className="bg-black border border-border-visible rounded-[12px] px-md py-sm
                           font-body text-body-sm text-text-display placeholder:text-text-disabled
                           focus:outline-none focus:border-text-display transition-colors resize-y
                           disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </label>
            {compNoteMissing && (
              <p className="font-body text-body-sm text-accent leading-[1.5]">
                {copy.noteRequired}
              </p>
            )}

            <button
              type="button"
              onClick={doIssue}
              disabled={issueDisabled}
              className="self-start bg-text-display text-black font-mono uppercase tracking-[0.08em]
                         px-xl min-h-[48px] inline-flex items-center justify-center rounded-full text-label
                         hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed
                         transition duration-150 ease-out-nothing"
            >
              [ {pending === "issue" ? copy.issuing : hasKey ? copy.extend : copy.issue} ]
            </button>
          </div>

          {/* moderation */}
          <div className="flex flex-col gap-sm border-t border-border-visible pt-lg">
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
              {copy.moderationTitle}
            </span>
            <p className="font-body text-body-sm text-text-secondary leading-[1.5]">
              {copy.moderationHint}
            </p>
            <button
              type="button"
              onClick={doBlock}
              disabled={pending !== null}
              className={`self-start inline-flex min-h-[44px] items-center justify-center rounded-full px-lg
                         font-mono text-label uppercase tracking-[0.08em] border transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed ${
                           isBlocked
                             ? "border-success text-success hover:bg-success/10"
                             : "border-accent text-accent hover:bg-accent/10"
                         }`}
            >
              [ {pending === "block" ? copy.blocking : isBlocked ? copy.unblock : copy.block} ]
            </button>
          </div>

          {/* manual fallback */}
          <div className="flex flex-col gap-sm border-t border-border-visible pt-lg">
            <button
              type="button"
              onClick={() => setManualOpen((v) => !v)}
              className="self-start font-mono text-label uppercase tracking-[0.08em] text-text-secondary hover:text-text-display transition-colors"
            >
              {manualOpen ? "−" : "+"} {copy.manualToggle}
            </button>
            {manualOpen && (
              <div className="flex flex-col gap-sm">
                <p className="font-body text-body-sm text-text-secondary leading-[1.5]">
                  {copy.manualHint}
                </p>
                <label className="flex flex-col gap-xs">
                  <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
                    {copy.manualLabel}
                  </span>
                  <textarea
                    rows={3}
                    value={manualUrl}
                    spellCheck={false}
                    disabled={pending !== null}
                    onChange={(e) => setManualUrl(e.target.value)}
                    className="bg-black border border-border-visible rounded-[12px] px-md py-sm
                               font-mono text-body-sm text-text-display placeholder:text-text-disabled
                               focus:outline-none focus:border-text-display transition-colors resize-y break-all
                               disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </label>
                <button
                  type="button"
                  onClick={doManual}
                  disabled={pending !== null || !manualUrl.trim()}
                  className="self-start inline-flex min-h-[44px] items-center justify-center rounded-full px-lg
                             font-mono text-label uppercase tracking-[0.08em] border border-border-visible text-text-display
                             hover:border-text-display transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  [ {pending === "manual" ? copy.attaching : copy.attach} ]
                </button>
              </div>
            )}
          </div>

          {flash && (
            <p
              role="alert"
              className={`font-body text-body-sm leading-[1.55] ${
                flash.kind === "success" ? "text-success" : "text-accent"
              }`}
            >
              {flash.message}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function PeriodPicker({
  copy,
  period,
  disabled,
  onPreset,
}: {
  copy: AdminGrantCopy;
  period: Period;
  disabled: boolean;
  onPreset: (p: Period) => void;
}) {
  const periods: Period[] = ["1mo", "6mo", "1yr"];
  return (
    <div className="flex flex-col gap-sm">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {copy.periodLabel}
      </span>
      <div className="flex flex-wrap gap-sm">
        {periods.map((p) => {
          const active = period === p;
          return (
            <button
              key={p}
              type="button"
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onPreset(p)}
              className={`inline-flex min-h-[40px] items-center justify-center rounded-full px-md
                         font-mono text-label uppercase tracking-[0.08em] border transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed ${
                           active
                             ? "border-text-display bg-text-display text-black"
                             : "border-border-visible text-text-secondary hover:border-text-display"
                         }`}
            >
              {copy.periodLabels[p]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function KeyReveal({ url, copy }: { url: string; copy: AdminGrantCopy }) {
  const [revealed, setRevealed] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="flex flex-col gap-sm">
      <span className="font-mono text-body-sm text-text-display break-all leading-[1.55]">
        {revealed ? url : maskUrl(url)}
      </span>
      <div className="flex flex-wrap gap-sm">
        <button
          type="button"
          aria-pressed={revealed}
          onClick={() => setRevealed((v) => !v)}
          className="inline-flex min-h-[36px] items-center justify-center border border-border-visible px-md
                     font-mono text-label uppercase tracking-[0.08em] text-text-display
                     hover:border-text-display transition-colors"
        >
          [ {revealed ? copy.hide : copy.show} ]
        </button>
        <button
          type="button"
          onClick={copyUrl}
          className="inline-flex min-h-[36px] items-center justify-center border border-border-visible px-md
                     font-mono text-label uppercase tracking-[0.08em] text-text-display
                     hover:border-text-display transition-colors"
        >
          [ {copyState === "copied" ? copy.copied : copy.copy} ]
        </button>
      </div>
      {copyState === "error" && (
        <p className="font-body text-body-sm text-accent leading-[1.55]">
          {copy.copyError}
        </p>
      )}
    </div>
  );
}

function ExpiryLine({
  subscription,
  copy,
  locale,
}: {
  subscription: Subscription;
  copy: AdminGrantCopy;
  locale: string;
}) {
  const issued = new Date(subscription.issuedAt).getTime();
  if (Number.isNaN(issued)) return null;
  const expiry = issued + subscription.periodDays * MS_PER_DAY;
  const remaining = Math.round((expiry - Date.now()) / MS_PER_DAY);
  const sourceLabel =
    subscription.source === "manual-grant" ? copy.sourceManual : copy.sourceAuto;
  return (
    <div className="flex flex-col gap-xs border-t border-border-visible pt-sm">
      <span className="font-mono text-label uppercase tracking-[0.1em] text-text-disabled">
        {copy.keyExpiry}: {formatAdminDate(new Date(expiry).toISOString(), locale)}{" "}
        <span className="text-text-secondary">({copy.keyApprox})</span>
      </span>
      <span
        className={`font-mono text-label uppercase tracking-[0.08em] ${
          remaining >= 0 ? "text-text-secondary" : "text-accent"
        }`}
      >
        {remaining >= 0 ? copy.keyDaysLeft(remaining) : copy.keyDaysAgo(-remaining)}{" "}
        · {sourceLabel}
      </span>
    </div>
  );
}

function StatusBadge({ status, copy }: { status: string; copy: AdminGrantCopy }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: copy.statusActive, cls: "border-success text-success" },
    pending: { label: copy.statusPending, cls: "border-warning text-warning" },
    blocked: { label: copy.statusBlocked, cls: "border-accent text-accent" },
  };
  const v = map[status] ?? { label: status, cls: "border-border-visible text-text-secondary" };
  return (
    <span
      className={`inline-flex items-center min-h-[28px] px-sm border rounded-full font-mono text-[10px] uppercase tracking-[0.12em] ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

function AdminNav({
  copy,
  active,
}: {
  copy: AdminGrantCopy;
  active: "users" | "grant";
}) {
  return (
    <nav className="flex flex-col gap-sm sm:flex-row sm:items-center sm:justify-between">
      <Link
        href="/admin/users"
        className="inline-flex items-center min-h-[44px] self-start
                   font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80"
      >
        {copy.backToUsers} {"←"}
      </Link>
      <div className="flex gap-sm font-mono text-label uppercase tracking-[0.08em]
                      [&_a]:inline-flex [&_a]:items-center [&_a]:min-h-[44px] [&_a]:border [&_a]:px-md
                      [&_a]:transition-colors">
        <Link
          href="/admin/users"
          className={
            active === "users"
              ? "border-text-display text-text-display"
              : "border-border-visible text-text-secondary hover:border-text-display"
          }
        >
          {copy.navUsers}
        </Link>
        <Link
          href="/admin/grant"
          className={
            active === "grant"
              ? "border-text-display text-text-display"
              : "border-border-visible text-text-secondary hover:border-text-display"
          }
        >
          {copy.navGrant}
        </Link>
        <Link
          href="/admin/analytics"
          className="border-border-visible text-text-secondary hover:border-text-display"
        >
          {copy.navAnalytics}
        </Link>
      </div>
    </nav>
  );
}

function CardRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-md border-t border-border-visible py-sm last:border-b">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      <span
        className={`min-w-0 break-words text-text-display ${
          mono
            ? "font-mono text-body-sm"
            : "font-mono text-label uppercase tracking-[0.08em]"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function AdminNote({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <article className="border border-border-visible rounded-[8px] p-lg min-h-[170px] flex flex-col gap-md">
      <span className="font-mono text-label uppercase tracking-[0.14em] text-text-disabled">
        {index}
      </span>
      <h2 className="font-body font-bold text-text-display text-subheading leading-[1.2]">
        {title}
      </h2>
      <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
        {body}
      </p>
    </article>
  );
}

function AdminInput({
  label,
  type,
  value,
  onChange,
  autoComplete,
  placeholder,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="bg-black border border-border-visible rounded-full px-lg min-h-[48px]
                   font-mono text-body-sm text-text-display placeholder:text-text-disabled
                   focus:outline-none focus:border-text-display transition-colors"
      />
    </label>
  );
}

// One of: numeric Telegram id, @username, or email — the three shapes the
// grant resolver accepts. Used to drive the manual-attach fallback from a
// looked-up user without re-typing the identifier.
function canonicalIdentifier(user: CardUser): string {
  if (user.email) return user.email;
  if (user.telegramUsername) return `@${user.telegramUsername}`;
  if (user.telegramId) return user.telegramId;
  return "";
}

function validateSubscriptionUrl(
  value: string,
  copy: AdminGrantCopy
): string | null {
  if (!value) return copy.errors.subscription_url_required;
  try {
    const url = new URL(value);
    const allowed = new Set([
      "https:",
      "http:",
      "vless:",
      "vmess:",
      "trojan:",
      "ss:",
      "hysteria2:",
      "hy2:",
      "wireguard:",
    ]);
    if (!allowed.has(url.protocol)) return copy.errors.invalid_subscription_url;
  } catch {
    return copy.errors.invalid_subscription_url;
  }
  return null;
}

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

function maskUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.origin !== "null") {
      return `${url.origin}${url.pathname.slice(0, 10)}...`;
    }
    return `${url.protocol}//${url.host || url.pathname.slice(0, 18)}...`;
  } catch {
    return `${value.slice(0, 18)}...`;
  }
}

function formatAdminDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getCopy(locale: string) {
  return locale === "ru" ? COPY.ru : COPY.en;
}
