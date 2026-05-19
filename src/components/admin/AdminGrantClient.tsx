"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";

type GrantUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  accessStatus: string;
  vpnSlug: string | null;
  subscriptionUrl: string | null;
  updatedAt: string;
};

type GrantResult =
  | { kind: "idle" }
  | { kind: "success"; user: GrantUser }
  | { kind: "error"; message: string };

const errorMessages: Record<string, string> = {
  unauthorized: "Wrong ADMIN_SECRET.",
  not_found: "Admin endpoint is disabled. Add ADMIN_SECRET in Vercel env.",
  user_not_found: "No account exists for this email.",
  email_required: "Email is required.",
  invalid_email: "Email looks invalid.",
  subscription_url_required: "Subscription/config URL is required.",
  invalid_subscription_url: "Use a supported subscription URL or config URI.",
  kv_not_configured: "Account storage is not configured.",
  auth_secret_not_configured: "AUTH_SECRET is not configured.",
  invalid_json: "Invalid request body.",
  grant_failed: "Grant failed. Check server logs.",
};

export function AdminGrantClient({ locale }: { locale: string }) {
  const [secret, setSecret] = useState("");
  const [email, setEmail] = useState("");
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<GrantResult>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedUrl = subscriptionUrl.trim();
    const localError = validateGrantInput(normalizedEmail, normalizedUrl);
    if (localError) {
      setResult({ kind: "error", message: localError });
      return;
    }

    setPending(true);
    setResult({ kind: "idle" });

    try {
      const res = await fetch("/api/admin/grant", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({
          email: normalizedEmail,
          subscriptionUrl: normalizedUrl,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        user?: GrantUser;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.user) {
        setResult({
          kind: "error",
          message: errorMessages[data.error || ""] || "Unknown admin error.",
        });
        return;
      }

      setResult({ kind: "success", user: data.user });
    } catch {
      setResult({ kind: "error", message: "Network error." });
    } finally {
      setPending(false);
    }
  }

  const hasPreview = email.trim() || subscriptionUrl.trim();

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-6xl mx-auto px-lg flex flex-col gap-2xl">
        <header className="grid gap-xl lg:grid-cols-[1fr_320px] lg:items-end">
          <div className="flex flex-col gap-md">
            <p className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              PRSLOY ADMIN
            </p>
            <h1
              className="font-body font-bold text-text-display leading-[0.98]"
              style={{ fontSize: "clamp(40px, 7vw, 84px)" }}
            >
              Issue access.
            </h1>
            <p className="max-w-2xl font-body text-body text-text-secondary leading-[1.65]">
              Attach a real VPN subscription/config URL to an existing PRSLOY ID. No payment
              state is created here; this is manual beta issuing.
            </p>
          </div>

          <section className="border border-border-visible rounded-[8px] bg-surface p-lg flex flex-col gap-md">
            <div className="flex items-center justify-between gap-md font-mono text-label uppercase tracking-[0.14em]">
              <span className="text-text-disabled">OPERATOR</span>
              <span className="text-text-display">GRANT</span>
            </div>
            <div className="grid grid-cols-3 gap-sm">
              {["FIND", "ATTACH", "VERIFY"].map((item, index) => (
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

        <section className="grid grid-cols-1 lg:grid-cols-[1fr_0.86fr] gap-md">
          <form
            onSubmit={onSubmit}
            className="border border-border-visible rounded-[8px] p-xl sm:p-2xl bg-surface flex flex-col gap-lg"
          >
            <div className="flex items-center gap-md border-b border-border-visible pb-lg">
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                Access input
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
              label="Account email"
              type="email"
              value={email}
              onChange={setEmail}
              autoComplete="email"
            />
            <AdminInput
              label="VPN subscription/config URL"
              type="text"
              value={subscriptionUrl}
              onChange={setSubscriptionUrl}
              autoComplete="off"
            />

            <button
              type="submit"
              disabled={pending}
              className="mt-sm bg-text-display text-black font-mono uppercase tracking-[0.08em]
                         px-xl min-h-[48px] inline-flex items-center justify-center rounded-full text-label
                         hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait
                         transition duration-150 ease-out-nothing"
            >
              [ {pending ? "Granting..." : "Grant access"} ]
            </button>

            {result.kind === "error" && (
              <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
                {result.message}
              </p>
            )}
          </form>

          <aside className="border border-border-visible rounded-[8px] bg-black p-xl sm:p-2xl flex flex-col gap-xl">
            <div className="flex items-center justify-between gap-md">
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                Grant preview
              </span>
              <span
                className={`inline-block h-3 w-3 rounded-full ${
                  result.kind === "success"
                    ? "bg-success shadow-[0_0_14px_rgba(74,158,92,0.8)]"
                    : "bg-warning animate-pulse"
                }`}
              />
            </div>

            {result.kind === "success" ? (
              <SuccessPanel user={result.user} locale={locale} />
            ) : (
              <PreviewPanel email={email} subscriptionUrl={subscriptionUrl} hasPreview={Boolean(hasPreview)} />
            )}
          </aside>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-md">
          <AdminNote index="01" title="Existing account" body="The user must create a PRSLOY ID first. This tool does not register accounts." />
          <AdminNote index="02" title="Real config only" body="Paste the actual subscription/config URL from the provisioning panel. Bad URLs are rejected." />
          <AdminNote index="03" title="User reloads dashboard" body="After success, the user can refresh the dashboard and see active access immediately." />
        </section>
      </div>
    </main>
  );
}

function PreviewPanel({
  email,
  subscriptionUrl,
  hasPreview,
}: {
  email: string;
  subscriptionUrl: string;
  hasPreview: boolean;
}) {
  const trimmedUrl = subscriptionUrl.trim();
  return (
    <div className="flex flex-col gap-lg">
      <div className="font-display font-bold text-text-display leading-[0.85]"
           style={{ fontSize: "clamp(64px, 10vw, 112px)", letterSpacing: "0.02em" }}>
        {hasPreview ? "01" : "00"}
      </div>
      <div className="flex flex-col">
        <PreviewRow label="Email" value={email.trim().toLowerCase() || "waiting"} />
        <PreviewRow label="Config" value={trimmedUrl ? maskUrl(trimmedUrl) : "waiting"} />
        <PreviewRow label="Result" value="ready to issue" />
      </div>
      <p className="font-body text-body-sm text-text-secondary leading-[1.65]">
        This preview does not call the API. The access state changes only after the grant request
        returns success.
      </p>
    </div>
  );
}

function SuccessPanel({ user, locale }: { user: GrantUser; locale: string }) {
  return (
    <div className="flex flex-col gap-lg">
      <div className="font-display font-bold text-text-display leading-[0.85]"
           style={{ fontSize: "clamp(64px, 10vw, 112px)", letterSpacing: "0.02em" }}>
        OK
      </div>
      <div className="flex flex-col">
        <PreviewRow label="Email" value={user.email} />
        <PreviewRow label="Access" value={user.accessStatus} />
        <PreviewRow label="Verified" value={user.emailVerified ? "yes" : "pending email"} />
        <PreviewRow label="Slug" value={user.vpnSlug || "created"} />
        <PreviewRow label="Updated" value={formatAdminDate(user.updatedAt, locale)} />
      </div>
      {user.subscriptionUrl && (
        <a
          href={user.subscriptionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-body-sm text-text-display break-all hover:opacity-80"
        >
          {user.subscriptionUrl}
        </a>
      )}
      <Link
        href="/dashboard"
        className="self-start font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80"
      >
        Open dashboard check →
      </Link>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-md border-t border-border-visible py-md last:border-b">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      <span className="min-w-0 font-mono text-label uppercase tracking-[0.08em] text-text-display break-words">
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

function validateGrantInput(email: string, subscriptionUrl: string): string | null {
  if (!email) return "Email is required.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return "Email looks invalid.";
  }
  if (!subscriptionUrl) return "Subscription/config URL is required.";
  try {
    const url = new URL(subscriptionUrl);
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
    if (!allowed.has(url.protocol)) {
      return "Use a supported subscription URL or config URI.";
    }
  } catch {
    return "Use a supported subscription URL or config URI.";
  }
  return null;
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

function AdminInput({
  label,
  type,
  value,
  onChange,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      <input
        type={type}
        required
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="bg-black border border-border-visible rounded-full px-lg min-h-[48px]
                   font-mono text-body-sm text-text-display placeholder:text-text-disabled
                   focus:outline-none focus:border-text-display transition-colors"
      />
    </label>
  );
}
