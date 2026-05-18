"use client";

import { useMemo, useState } from "react";
import { Link } from "@/i18n/routing";

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

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "ALL" },
  { key: "pending", label: "PENDING" },
  { key: "active", label: "ACTIVE" },
  { key: "no_key", label: "NO KEY" },
];

const errorMessages: Record<string, string> = {
  unauthorized: "Wrong ADMIN_SECRET.",
  not_found: "Admin endpoint is disabled. Add ADMIN_SECRET in Vercel env.",
  kv_not_configured: "Account storage is not configured.",
  auth_secret_not_configured: "AUTH_SECRET is not configured.",
  list_failed: "Could not load users. Check server logs.",
  reissue_list_failed: "Could not load reissue requests. Check server logs.",
  reissue_update_failed: "Could not update the reissue request.",
  request_not_found: "Reissue request was not found.",
  invalid_json: "Invalid request body.",
};

export function AdminUsersClient({ locale }: { locale: string }) {
  const [secret, setSecret] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [requests, setRequests] = useState<AdminReissueRequest[] | null>(null);
  const [pending, setPending] = useState(false);
  const [requestPendingId, setRequestPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [usersError, setUsersError] = useState("");
  const [reissueError, setReissueError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function loadUsers(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    if (!secret.trim()) {
      setError("ADMIN_SECRET is required.");
      return;
    }

    setPending(true);
    setError("");
    setUsersError("");
    setReissueError("");

    // Independent loads: a failure of one endpoint must not blank the
    // other list. allSettled never rejects, so one network error does
    // not abort the sibling fetch.
    const authHeader = { Authorization: `Bearer ${secret.trim()}` };
    const [usersOutcome, reissueOutcome] = await Promise.allSettled([
      fetch("/api/admin/users", { headers: authHeader }),
      fetch("/api/admin/reissue", { headers: authHeader }),
    ]);

    if (usersOutcome.status === "fulfilled") {
      const res = usersOutcome.value;
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        users?: AdminUser[];
        error?: string;
      };
      if (res.ok && data.ok && Array.isArray(data.users)) {
        setUsers(data.users);
      } else {
        setUsers(null);
        setUsersError(errorMessages[data.error || ""] || "Could not load users.");
      }
    } else {
      setUsers(null);
      setUsersError("Network error.");
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
        setRequests(null);
        setReissueError(
          errorMessages[data.error || ""] || "Could not load reissue requests."
        );
      }
    } else {
      setRequests(null);
      setReissueError("Network error.");
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
      // Clipboard unavailable (insecure context) — ignore silently.
    }
  }

  async function markRequestHandled(request: AdminReissueRequest) {
    if (requestPendingId || request.status === "handled") return;
    if (!secret.trim()) {
      setError("ADMIN_SECRET is required.");
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
        setError(errorMessages[data.error || ""] || "Unknown admin error.");
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
      setError("Network error.");
    } finally {
      setRequestPendingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-6xl mx-auto px-lg flex flex-col gap-2xl">
        <header className="flex flex-col gap-md">
          <div className="flex items-center justify-between gap-md">
            <p className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              PRSLOY ADMIN
            </p>
            <Link
              href="/admin/grant"
              className="font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80"
            >
              Grant access -&gt;
            </Link>
          </div>
          <h1
            className="font-body font-bold text-text-display leading-[0.98]"
            style={{ fontSize: "clamp(40px, 7vw, 84px)" }}
          >
            Operator view.
          </h1>
          <p className="max-w-2xl font-body text-body text-text-secondary leading-[1.65]">
            A read-only list of PRSLOY accounts plus manual reissue requests. Search and
            filtering run in the browser. Raw configs are not exposed here.
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
                       transition-all duration-150"
          >
            [ {pending ? "Loading..." : users ? "Reload" : "Load users"} ]
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
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`inline-flex items-center gap-sm border px-md min-h-[44px]
                                font-mono text-label uppercase tracking-[0.08em] transition-colors
                                ${
                                  filter === f.key
                                    ? "bg-text-display text-black border-text-display"
                                    : "border-border-visible text-text-secondary hover:border-text-display"
                                }`}
                  >
                    {f.label}
                    <span className="tabular-nums opacity-70">{counts[f.key]}</span>
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-xs lg:w-[280px]">
                <span className="sr-only">Search by email</span>
                <input
                  type="search"
                  value={query}
                  placeholder="Search by email"
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
                {counts.all === 0 ? "No accounts yet." : "No accounts match."}
              </p>
            ) : (
              <div className="flex flex-col gap-sm">
                {filtered.map((user) => (
                  <UserRow
                    key={user.id}
                    user={user}
                    locale={locale}
                    copied={copiedId === user.id}
                    onCopy={() => copyEmail(user)}
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

function ReissueQueue({
  requests,
  locale,
  pendingId,
  onMarkHandled,
}: {
  requests: AdminReissueRequest[];
  locale: string;
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
            REISSUE QUEUE
          </span>
          <h2 className="font-body font-bold text-text-display text-heading leading-[1.1]">
            Manual key replacements.
          </h2>
          <p className="max-w-2xl font-body text-body-sm text-text-secondary leading-[1.6]">
            Requests contain account identifiers and a config hash only. Replace the
            key in the provider panel, grant the new config, then mark the request done.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-sm font-mono text-label uppercase tracking-[0.1em]">
          <QueueCounter label="Open" value={open.length} tone="warning" />
          <QueueCounter label="Handled" value={handled.length} tone="success" />
        </div>
      </div>

      {ordered.length === 0 ? (
        <p className="border border-border-visible rounded-[8px] p-lg font-mono text-label
                      uppercase tracking-[0.1em] text-text-disabled">
          No reissue requests yet.
        </p>
      ) : (
        <div className="flex flex-col gap-sm">
          {ordered.map((request) => (
            <ReissueRow
              key={request.requestId}
              request={request}
              locale={locale}
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
  pending,
  onMarkHandled,
}: {
  request: AdminReissueRequest;
  locale: string;
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
            label={request.status.toUpperCase()}
            tone={isOpen ? "warning" : "success"}
          />
        </div>
        <div className="grid gap-xs font-mono text-label uppercase tracking-[0.08em] text-text-secondary sm:grid-cols-2">
          <span className="break-all">Request {request.requestId}</span>
          <span className="break-all">User {request.userId}</span>
          <span className="break-all">Slug {request.vpnSlug || "none"}</span>
          <span className="break-all">Hash {shortHash(request.subscriptionUrlHash)}</span>
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
          <button
            type="button"
            onClick={onMarkHandled}
            disabled={pending}
            className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
                       font-mono text-label uppercase tracking-[0.08em] text-text-display
                       hover:border-text-display disabled:opacity-60 disabled:cursor-wait transition-colors"
          >
            [ {pending ? "Saving..." : "Mark done"} ]
          </button>
        ) : (
          <span className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
                           font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
            [ Done ]
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
  copied,
  onCopy,
}: {
  user: AdminUser;
  locale: string;
  copied: boolean;
  onCopy: () => void;
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
            label={user.emailVerified ? "EMAIL VERIFIED" : "EMAIL UNVERIFIED"}
            tone={user.emailVerified ? "success" : "muted"}
          />
          <StatusChip
            label={`ACCESS · ${user.accessStatus.toUpperCase()}`}
            tone={accessTone(user.accessStatus)}
          />
          <StatusChip
            label={user.hasSubscriptionUrl ? "KEY ISSUED" : "NO KEY"}
            tone={user.hasSubscriptionUrl ? "success" : "muted"}
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-md md:justify-end">
        <span className="font-mono text-label uppercase tracking-[0.1em] text-text-disabled tabular-nums">
          {formatAdminDate(user.createdAt, locale)}
        </span>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-md
                     font-mono text-label uppercase tracking-[0.08em] text-text-display
                     hover:border-text-display transition-colors"
        >
          [ {copied ? "COPIED" : "COPY EMAIL"} ]
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
