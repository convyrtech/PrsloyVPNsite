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
};

export function AdminUsersClient({ locale }: { locale: string }) {
  const [secret, setSecret] = useState("");
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
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

    try {
      const res = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${secret.trim()}` },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        users?: AdminUser[];
        error?: string;
      };

      if (!res.ok || !data.ok || !Array.isArray(data.users)) {
        setError(errorMessages[data.error || ""] || "Unknown admin error.");
        setUsers(null);
        return;
      }

      setUsers(data.users);
    } catch {
      setError("Network error.");
    } finally {
      setPending(false);
    }
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
            A read-only list of PRSLOY accounts. Search and filtering run in the
            browser. Issuing access, revoke and deletion are not done here.
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

        {users && (
          <section className="flex flex-col gap-lg">
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
        )}
      </div>
    </main>
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
