"use client";

import { useEffect, useMemo, useState } from "react";
import { Link } from "@/i18n/routing";
import {
  clearStoredAdminSecret,
  getStoredAdminSecret,
  storeAdminSecret,
} from "@/lib/admin-secret-storage";

type AdminUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  accessStatus: string;
  vpnSlug: string | null;
  hasSubscriptionUrl: boolean;
  createdAt: string;
  updatedAt: string;
};

type AdminReissueRequest = {
  requestId: string;
  userId: string;
  email: string;
  vpnSlug: string | null;
  subscriptionUrlHash: string | null;
  reason: string | null;
  status: "open" | "handled";
  createdAt: string;
  handledAt?: string;
};

type Filter = "all" | "pending" | "active" | "no_key";

type AdminUsersCopy = {
  navUsers: string;
  navGrant: string;
  title: string;
  subtitle: string;
  secretRequired: string;
  loadUsers: string;
  reload: string;
  loading: string;
  searchPlaceholder: string;
  searchLabel: string;
  noAccounts: string;
  noMatch: string;
  copied: string;
  copyEmail: string;
  deleteUser: string;
  deletingUser: string;
  deleteConfirm: string;
  emailVerified: string;
  emailUnverified: string;
  access: string;
  keyIssued: string;
  noKey: string;
  queueLabel: string;
  queueTitle: string;
  queueBody: string;
  queueOpen: string;
  queueHandled: string;
  noReissue: string;
  requestLabel: string;
  userLabel: string;
  slugLabel: string;
  hashLabel: string;
  saving: string;
  markDone: string;
  grantNew: string;
  issueKey: string;
  done: string;
  filters: Record<Filter, string>;
  statuses: Record<string, string>;
  errors: Record<string, string>;
};

const FILTER_KEYS: Filter[] = ["all", "pending", "active", "no_key"];

const COPY: Record<"ru" | "en", AdminUsersCopy> = {
  ru: {
    navUsers: "Пользователи",
    navGrant: "Выдать доступ",
    title: "Пользователи.",
    subtitle:
      "Список PRSLOY ID и заявки на перевыпуск. Конфиги здесь не показываем: только статус, email и служебные признаки.",
    secretRequired: "Нужен ADMIN_SECRET.",
    loadUsers: "Загрузить",
    reload: "Обновить",
    loading: "Загрузка...",
    searchPlaceholder: "Поиск по email",
    searchLabel: "Поиск по email",
    noAccounts: "Аккаунтов пока нет.",
    noMatch: "Ничего не найдено.",
    copied: "Скопировано",
    copyEmail: "Копировать email",
    deleteUser: "Удалить",
    deletingUser: "Удаляем...",
    deleteConfirm:
      "Удалить этот аккаунт из PRSLOY? Это освободит email для новой регистрации.",
    emailVerified: "Почта подтверждена",
    emailUnverified: "Почта не подтверждена",
    access: "Доступ",
    keyIssued: "Ключ выдан",
    noKey: "Без ключа",
    queueLabel: "Очередь перевыпуска",
    queueTitle: "Ручная замена ключей.",
    queueBody:
      "Заявка содержит email, id пользователя и хэш конфига. Замени ключ у провайдера, выдай новый конфиг, потом отметь заявку закрытой.",
    queueOpen: "Открыто",
    queueHandled: "Закрыто",
    noReissue: "Заявок на перевыпуск пока нет.",
    requestLabel: "Заявка",
    userLabel: "Пользователь",
    slugLabel: "Slug",
    hashLabel: "Hash",
    saving: "Сохраняем...",
    markDone: "Закрыть",
    grantNew: "Выдать новый",
    issueKey: "Выдать ключ",
    done: "Готово",
    filters: {
      all: "Все",
      pending: "Ожидают",
      active: "Активные",
      no_key: "Без ключа",
    },
    statuses: {
      pending: "ожидает",
      active: "активен",
      blocked: "заблокирован",
    },
    errors: {
      unauthorized: "Неверный ADMIN_SECRET.",
      not_found: "Админ endpoint отключен. Добавь ADMIN_SECRET в Vercel env.",
      kv_not_configured: "Хранилище аккаунтов не настроено.",
      auth_secret_not_configured: "AUTH_SECRET не настроен.",
      list_failed: "Не получилось загрузить пользователей. Проверь server logs.",
      reissue_list_failed: "Не получилось загрузить заявки на перевыпуск.",
      reissue_update_failed: "Не получилось обновить заявку.",
      request_not_found: "Заявка на перевыпуск не найдена.",
      user_id_required: "Не передан пользователь.",
      user_not_found: "Пользователь не найден.",
      delete_failed: "Не получилось удалить пользователя. Проверь server logs.",
      invalid_json: "Неверное тело запроса.",
      users_unknown: "Не получилось загрузить пользователей.",
      reissue_unknown: "Не получилось загрузить заявки на перевыпуск.",
      admin_unknown: "Неизвестная ошибка админки.",
      network: "Ошибка сети.",
    },
  },
  en: {
    navUsers: "Users",
    navGrant: "Grant access",
    title: "Operator view.",
    subtitle:
      "A read-only list of PRSLOY accounts plus manual reissue requests. Raw configs are not exposed here.",
    secretRequired: "ADMIN_SECRET is required.",
    loadUsers: "Load users",
    reload: "Reload",
    loading: "Loading...",
    searchPlaceholder: "Search by email",
    searchLabel: "Search by email",
    noAccounts: "No accounts yet.",
    noMatch: "No accounts match.",
    copied: "Copied",
    copyEmail: "Copy email",
    deleteUser: "Delete",
    deletingUser: "Deleting...",
    deleteConfirm:
      "Delete this PRSLOY account? This frees the email for a new registration.",
    emailVerified: "Email verified",
    emailUnverified: "Email unverified",
    access: "Access",
    keyIssued: "Key issued",
    noKey: "No key",
    queueLabel: "Reissue queue",
    queueTitle: "Manual key replacements.",
    queueBody:
      "Requests contain account identifiers and a config hash only. Replace the key in the provider panel, grant the new config, then mark the request done.",
    queueOpen: "Open",
    queueHandled: "Handled",
    noReissue: "No reissue requests yet.",
    requestLabel: "Request",
    userLabel: "User",
    slugLabel: "Slug",
    hashLabel: "Hash",
    saving: "Saving...",
    markDone: "Mark done",
    grantNew: "Issue new",
    issueKey: "Issue key",
    done: "Done",
    filters: {
      all: "All",
      pending: "Pending",
      active: "Active",
      no_key: "No key",
    },
    statuses: {
      pending: "pending",
      active: "active",
      blocked: "blocked",
    },
    errors: {
      unauthorized: "Wrong ADMIN_SECRET.",
      not_found: "Admin endpoint is disabled. Add ADMIN_SECRET in Vercel env.",
      kv_not_configured: "Account storage is not configured.",
      auth_secret_not_configured: "AUTH_SECRET is not configured.",
      list_failed: "Could not load users. Check server logs.",
      reissue_list_failed: "Could not load reissue requests. Check server logs.",
      reissue_update_failed: "Could not update the reissue request.",
      request_not_found: "Reissue request was not found.",
      user_id_required: "Missing user id.",
      user_not_found: "User was not found.",
      delete_failed: "Could not delete the user. Check server logs.",
      invalid_json: "Invalid request body.",
      users_unknown: "Could not load users.",
      reissue_unknown: "Could not load reissue requests.",
      admin_unknown: "Unknown admin error.",
      network: "Network error.",
    },
  },
};

export function AdminUsersClient({ locale }: { locale: string }) {
  const copy = getCopy(locale);
  const [secret, setSecret] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [requests, setRequests] = useState<AdminReissueRequest[] | null>(null);
  const [pending, setPending] = useState(false);
  const [requestPendingId, setRequestPendingId] = useState<string | null>(null);
  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [reissueError, setReissueError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Prefill from sessionStorage after hydration so server and client render
  // the same empty input on first paint.
  useEffect(() => {
    const stored = getStoredAdminSecret();
    if (stored) setSecret(stored);
  }, []);

  async function loadUsers(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const trimmedSecret = secret.trim();
    if (!trimmedSecret) {
      setError(copy.secretRequired);
      return;
    }

    setPending(true);
    setError("");
    setUsersError("");
    setReissueError("");

    // Independent loads: a failure of one endpoint must not blank the other list.
    const authHeader = { Authorization: `Bearer ${trimmedSecret}` };
    const [usersOutcome, reissueOutcome] = await Promise.allSettled([
      fetch("/api/admin/users", { headers: authHeader }),
      fetch("/api/admin/reissue", { headers: authHeader }),
    ]);

    let usersOk = false;
    let sawUnauthorized = false;

    if (usersOutcome.status === "fulfilled") {
      const res = usersOutcome.value;
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        users?: AdminUser[];
        error?: string;
      };
      if (res.ok && data.ok && Array.isArray(data.users)) {
        setUsers(data.users);
        usersOk = true;
      } else {
        if (res.status === 401) sawUnauthorized = true;
        setUsers(null);
        setUsersError(copy.errors[data.error || ""] || copy.errors.users_unknown);
      }
    } else {
      setUsers(null);
      setUsersError(copy.errors.network);
    }

    if (reissueOutcome.status === "fulfilled") {
      const res = reissueOutcome.value;
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        requests?: AdminReissueRequest[];
        error?: string;
      };
      if (res.ok && data.ok && Array.isArray(data.requests)) {
        setRequests(data.requests);
      } else {
        if (res.status === 401) sawUnauthorized = true;
        setRequests(null);
        setReissueError(copy.errors[data.error || ""] || copy.errors.reissue_unknown);
      }
    } else {
      setRequests(null);
      setReissueError(copy.errors.network);
    }

    if (usersOk) {
      storeAdminSecret(trimmedSecret);
    } else if (sawUnauthorized) {
      clearStoredAdminSecret();
    }

    setPending(false);
  }

  const counts = useMemo(() => {
    const list = users ?? [];
    return {
      all: list.length,
      pending: list.filter((u) => u.accessStatus === "pending").length,
      active: list.filter((u) => u.accessStatus === "active").length,
      no_key: list.filter((u) => !u.hasSubscriptionUrl).length,
    };
  }, [users]);

  const filtered = useMemo(() => {
    const list = users ?? [];
    const needle = query.trim().toLowerCase();
    return list.filter((u) => {
      if (needle && !u.email.includes(needle)) return false;
      if (filter === "pending") return u.accessStatus === "pending";
      if (filter === "active") return u.accessStatus === "active";
      if (filter === "no_key") return !u.hasSubscriptionUrl;
      return true;
    });
  }, [users, query, filter]);

  async function copyEmail(user: AdminUser) {
    try {
      await navigator.clipboard.writeText(user.email);
      setCopiedId(user.id);
      window.setTimeout(
        () => setCopiedId((current) => (current === user.id ? null : current)),
        1500
      );
    } catch {
      // Clipboard can be unavailable in insecure contexts.
    }
  }

  async function markRequestHandled(request: AdminReissueRequest) {
    if (requestPendingId || request.status === "handled") return;
    if (!secret.trim()) {
      setError(copy.secretRequired);
      return;
    }

    setRequestPendingId(request.requestId);
    setError("");

    try {
      const res = await fetch("/api/admin/reissue", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret.trim()}`,
        },
        body: JSON.stringify({
          action: "mark_handled",
          requestId: request.requestId,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        request?: AdminReissueRequest;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.request) {
        setError(copy.errors[data.error || ""] || copy.errors.admin_unknown);
        return;
      }

      setRequests((current) =>
        current
          ? current.map((item) =>
              item.requestId === data.request?.requestId ? data.request : item
            )
          : current
      );
    } catch {
      setError(copy.errors.network);
    } finally {
      setRequestPendingId(null);
    }
  }

  async function removeUser(user: AdminUser) {
    if (deletePendingId) return;
    if (!secret.trim()) {
      setError(copy.secretRequired);
      return;
    }
    if (!window.confirm(copy.deleteConfirm)) return;

    setDeletePendingId(user.id);
    setError("");

    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret.trim()}`,
        },
        body: JSON.stringify({ userId: user.id }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        user?: AdminUser;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.user) {
        setError(copy.errors[data.error || ""] || copy.errors.admin_unknown);
        return;
      }

      setUsers((current) =>
        current ? current.filter((item) => item.id !== data.user?.id) : current
      );
    } catch {
      setError(copy.errors.network);
    } finally {
      setDeletePendingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-6xl mx-auto px-lg flex flex-col gap-2xl">
        <AdminNav copy={copy} active="users" />

        <header className="flex flex-col gap-md">
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
        </header>

        <form
          onSubmit={loadUsers}
          className="border border-border-visible rounded-[8px] p-xl bg-surface flex flex-col gap-lg
                     sm:flex-row sm:items-end"
        >
          <label className="flex flex-1 flex-col gap-xs">
            <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
              ADMIN_SECRET
            </span>
            <input
              type="password"
              required
              value={secret}
              autoComplete="off"
              onChange={(e) => setSecret(e.target.value)}
              className="bg-black border border-border-visible rounded-full px-lg min-h-[48px]
                         font-mono text-body-sm text-text-display placeholder:text-text-disabled
                         focus:outline-none focus:border-text-display transition-colors"
            />
          </label>
          <button
            type="submit"
            disabled={pending}
            className="bg-text-display text-black font-mono uppercase tracking-[0.08em]
                       px-xl min-h-[48px] inline-flex items-center justify-center rounded-full text-label
                       hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait
                       transition duration-150"
          >
            [ {pending ? copy.loading : users ? copy.reload : copy.loadUsers} ]
          </button>
        </form>

        {error && (
          <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
            {error}
          </p>
        )}

        {requests ? (
          <ReissueQueue
            requests={requests}
            locale={locale}
            copy={copy}
            pendingId={requestPendingId}
            onMarkHandled={markRequestHandled}
          />
        ) : reissueError ? (
          <p
            role="alert"
            className="border border-border-visible rounded-[8px] p-xl font-body text-body-sm text-accent leading-[1.55]"
          >
            {reissueError}
          </p>
        ) : null}

        {users ? (
          <section className="flex flex-col gap-2xl">
            <div className="flex flex-col gap-md lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-sm">
                {FILTER_KEYS.map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={`inline-flex items-center gap-sm border px-md min-h-[44px]
                                font-mono text-label uppercase tracking-[0.08em] transition-colors
                                ${
                                  filter === key
                                    ? "bg-text-display text-black border-text-display"
                                    : "border-border-visible text-text-secondary hover:border-text-display"
                                }`}
                  >
                    {copy.filters[key]}
                    <span className="tabular-nums opacity-70">{counts[key]}</span>
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-xs lg:w-[280px]">
                <span className="sr-only">{copy.searchLabel}</span>
                <input
                  type="search"
                  value={query}
                  placeholder={copy.searchPlaceholder}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-black border border-border-visible rounded-full px-lg min-h-[44px]
                             font-mono text-body-sm text-text-display placeholder:text-text-disabled
                             focus:outline-none focus:border-text-display transition-colors"
                />
              </label>
            </div>

            {filtered.length === 0 ? (
              <p className="border border-border-visible rounded-[8px] p-xl font-mono text-label
                            uppercase tracking-[0.1em] text-text-disabled">
                {counts.all === 0 ? copy.noAccounts : copy.noMatch}
              </p>
            ) : (
              <div className="flex flex-col gap-sm">
                {filtered.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    locale={locale}
                    copy={copy}
                    copied={copiedId === user.id}
                    onCopy={() => copyEmail(user)}
                    deletePending={deletePendingId === user.id}
                    onDelete={() => removeUser(user)}
                  />
                ))}
              </div>
            )}
          </section>
        ) : usersError ? (
          <p
            role="alert"
            className="border border-border-visible rounded-[8px] p-xl font-body text-body-sm text-accent leading-[1.55]"
          >
            {usersError}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function AdminNav({
  copy,
  active,
}: {
  copy: AdminUsersCopy;
  active: "users" | "grant";
}) {
  return (
    <nav className="flex justify-end gap-sm font-mono text-label uppercase tracking-[0.08em]">
      <Link
        href="/admin/users"
        className={`border px-md py-sm transition-colors ${
          active === "users"
            ? "border-text-display text-text-display"
            : "border-border-visible text-text-secondary hover:border-text-display"
        }`}
      >
        {copy.navUsers}
      </Link>
      <Link
        href="/admin/grant"
        className={`border px-md py-sm transition-colors ${
          active === "grant"
            ? "border-text-display text-text-display"
            : "border-border-visible text-text-secondary hover:border-text-display"
        }`}
      >
        {copy.navGrant}
      </Link>
    </nav>
  );
}

function ReissueQueue({
  requests,
  locale,
  copy,
  pendingId,
  onMarkHandled,
}: {
  requests: AdminReissueRequest[];
  locale: string;
  copy: AdminUsersCopy;
  pendingId: string | null;
  onMarkHandled: (request: AdminReissueRequest) => void;
}) {
  const open = requests.filter((request) => request.status === "open");
  const handled = requests.filter((request) => request.status === "handled");
  const ordered = [...open, ...handled.slice(0, 4)];

  return (
    <section className="border border-border-visible rounded-[8px] bg-surface p-xl flex flex-col gap-lg">
      <div className="flex flex-col gap-md lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-sm">
          <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
            {copy.queueLabel}
          </span>
          <h2 className="font-body font-bold text-text-display text-heading leading-[1.1]">
            {copy.queueTitle}
          </h2>
          <p className="max-w-2xl font-body text-body-sm text-text-secondary leading-[1.6]">
            {copy.queueBody}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-sm font-mono text-label uppercase tracking-[0.1em]">
          <QueueCounter label={copy.queueOpen} value={open.length} tone="warning" />
          <QueueCounter label={copy.queueHandled} value={handled.length} tone="success" />
        </div>
      </div>

      {ordered.length === 0 ? (
        <p className="border border-border-visible rounded-[8px] p-lg font-mono text-label
                      uppercase tracking-[0.1em] text-text-disabled">
          {copy.noReissue}
        </p>
      ) : (
        <div className="flex flex-col gap-sm">
          {ordered.map((request) => (
            <ReissueRow
              key={request.requestId}
              request={request}
              locale={locale}
              copy={copy}
              pending={pendingId === request.requestId}
              onMarkHandled={() => onMarkHandled(request)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ReissueRow({
  request,
  locale,
  copy,
  pending,
  onMarkHandled,
}: {
  request: AdminReissueRequest;
  locale: string;
  copy: AdminUsersCopy;
  pending: boolean;
  onMarkHandled: () => void;
}) {
  const isOpen = request.status === "open";
  return (
    <article
      className="border border-border-visible rounded-[8px] bg-black p-lg flex flex-col gap-md
                 lg:grid lg:grid-cols-[1fr_auto] lg:items-center lg:gap-lg"
    >
      <div className="flex min-w-0 flex-col gap-sm">
        <div className="flex flex-wrap items-center gap-sm">
          <span className="font-mono text-body-sm text-text-display break-all">
            {request.email}
          </span>
          <StatusChip
            label={isOpen ? copy.queueOpen : copy.queueHandled}
            tone={isOpen ? "warning" : "success"}
          />
        </div>
        <div className="grid gap-xs font-mono text-label uppercase tracking-[0.08em] text-text-secondary sm:grid-cols-2">
          <span className="break-all">
            {copy.requestLabel} {request.requestId}
          </span>
          <span className="break-all">
            {copy.userLabel} {request.userId}
          </span>
          <span className="break-all">
            {copy.slugLabel} {request.vpnSlug || "none"}
          </span>
          <span className="break-all">
            {copy.hashLabel} {shortHash(request.subscriptionUrlHash)}
          </span>
        </div>
        {request.reason && (
          <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
            {request.reason}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-sm sm:flex-row sm:items-center lg:justify-end">
        <span className="font-mono text-label uppercase tracking-[0.1em] text-text-disabled tabular-nums">
          {formatAdminDate(request.handledAt || request.createdAt, locale)}
        </span>
        {isOpen ? (
          <>
            <Link
              href={{ pathname: "/admin/grant", query: { email: request.email } }}
              className="inline-flex min-h-[44px] items-center justify-center bg-text-display px-md
                         font-mono text-label uppercase tracking-[0.08em] text-black
                         hover:opacity-90 active:scale-[0.98] transition"
            >
              [ {copy.grantNew} ]
            </Link>
            <button
              type="button"
              onClick={onMarkHandled}
              disabled={pending}
              className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:border-text-display disabled:opacity-60 disabled:cursor-wait transition-colors"
            >
              [ {pending ? copy.saving : copy.markDone} ]
            </button>
          </>
        ) : (
          <span className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
                           font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
            [ {copy.done} ]
          </span>
        )}
      </div>
    </article>
  );
}

function QueueCounter({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning";
}) {
  return (
    <div className="border border-border-visible bg-black p-md min-w-[112px]">
      <div className="flex items-center gap-sm text-text-disabled">
        <span
          className={`h-[6px] w-[6px] rounded-full ${
            tone === "success" ? "bg-success" : "bg-warning animate-pulse"
          }`}
        />
        <span>{label}</span>
      </div>
      <div className="mt-xs text-text-display tabular-nums">{value}</div>
    </div>
  );
}

function UserRow({
  user,
  locale,
  copy,
  copied,
  onCopy,
  deletePending,
  onDelete,
}: {
  user: AdminUser;
  locale: string;
  copy: AdminUsersCopy;
  copied: boolean;
  onCopy: () => void;
  deletePending: boolean;
  onDelete: () => void;
}) {
  return (
    <article
      className="border border-border-visible rounded-[8px] p-lg flex flex-col gap-md
                 md:grid md:grid-cols-[1fr_auto] md:items-center md:gap-lg"
    >
      <div className="flex min-w-0 flex-col gap-sm">
        <span className="font-mono text-body-sm text-text-display break-all">
          {user.email}
        </span>
        <div className="flex flex-wrap gap-xs">
          <StatusChip
            label={user.emailVerified ? copy.emailVerified : copy.emailUnverified}
            tone={user.emailVerified ? "success" : "muted"}
          />
          <StatusChip
            label={`${copy.access}: ${accessStatusLabel(user.accessStatus, copy)}`}
            tone={accessTone(user.accessStatus)}
          />
          <StatusChip
            label={user.hasSubscriptionUrl ? copy.keyIssued : copy.noKey}
            tone={user.hasSubscriptionUrl ? "success" : "muted"}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-md md:justify-end">
        <span className="font-mono text-label uppercase tracking-[0.1em] text-text-disabled tabular-nums">
          {formatAdminDate(user.createdAt, locale)}
        </span>
        <Link
          href={{ pathname: "/admin/grant", query: { email: user.email } }}
          className="inline-flex min-h-[44px] items-center justify-center bg-text-display px-md
                     font-mono text-label uppercase tracking-[0.08em] text-black
                     hover:opacity-90 active:scale-[0.98] transition"
        >
          [ {copy.issueKey} ]
        </Link>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
                     font-mono text-label uppercase tracking-[0.08em] text-text-display
                     hover:border-text-display transition-colors"
        >
          [ {copied ? copy.copied : copy.copyEmail} ]
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={deletePending}
          className="inline-flex min-h-[44px] items-center justify-center border border-accent/60 px-md
                     font-mono text-label uppercase tracking-[0.08em] text-accent
                     hover:border-accent disabled:opacity-60 disabled:cursor-wait transition-colors"
        >
          [ {deletePending ? copy.deletingUser : copy.deleteUser} ]
        </button>
      </div>
    </article>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "success" | "warning" | "accent" | "muted";
}) {
  const dot =
    tone === "success"
      ? "bg-success"
      : tone === "warning"
        ? "bg-warning"
        : tone === "accent"
          ? "bg-accent"
          : "bg-border-visible";
  return (
    <span className="inline-flex items-center gap-xs border border-border-visible px-sm py-[3px]">
      <span className={`h-[6px] w-[6px] rounded-full ${dot}`} />
      <span className="font-mono text-label uppercase tracking-[0.1em] text-text-secondary">
        {label}
      </span>
    </span>
  );
}

function accessTone(status: string): "success" | "warning" | "accent" | "muted" {
  if (status === "active") return "success";
  if (status === "pending") return "warning";
  if (status === "blocked") return "accent";
  return "muted";
}

function accessStatusLabel(status: string, copy: AdminUsersCopy) {
  return copy.statuses[status] || status;
}

function formatAdminDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  }).format(date);
}

function shortHash(value: string | null) {
  return value ? `${value.slice(0, 10)}...` : "none";
}

function getCopy(locale: string) {
  return locale === "ru" ? COPY.ru : COPY.en;
}
