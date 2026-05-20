"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import { LogoutButton, ResendVerificationButton } from "@/components/auth/AccountActions";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { TELEGRAM_BOT_URL } from "@/lib/links";
import type { PublicAuthUser } from "@/lib/auth";

export type DashboardCopy = Record<
  | "label"
  | "title"
  | "subtitle"
  | "setup_title"
  | "setup_body"
  | "loading_body"
  | "auth_required_label"
  | "auth_required_body"
  | "login_link"
  | "register_link"
  | "verify_title"
  | "verify_body"
  | "verify_resend"
  | "verify_sent"
  | "verify_error"
  | "email_label"
  | "email_verified"
  | "email_pending"
  | "access_label"
  | "access_active"
  | "access_pending"
  | "key_ready"
  | "key_not_issued"
  | "status_ready_title"
  | "status_ready_body"
  | "status_pending_title"
  | "status_pending_body"
  | "status_blocked_title"
  | "status_blocked_body"
  | "vpn_section_label"
  | "key_ready_body"
  | "key_pending_body"
  | "config_label"
  | "copy_key"
  | "copy_done"
  | "copy_error"
  | "show_key"
  | "hide_key"
  | "open_key"
  | "setup_link"
  | "next_label"
  | "next_active_1_title"
  | "next_active_1_body"
  | "next_pending_1_title"
  | "next_pending_1_body"
  | "reissue_title"
  | "reissue_body"
  | "reissue_button"
  | "reissue_disabled"
  | "reissue_sending"
  | "reissue_sent"
  | "reissue_sent_body"
  | "reissue_error_body"
  | "reissue_rate_limited"
  | "reissue_no_key"
  | "reissue_auth_required"
  | "support_title"
  | "support_body"
  | "support_link"
  | "account_label"
  | "account_created_label"
  | "updated_label"
  | "logout",
  string
>;

type State =
  | { kind: "loading" }
  | { kind: "not_configured" }
  | { kind: "ready"; user: PublicAuthUser | null };

type ReissueState = "idle" | "sending" | "sent" | "error";

export function DashboardClient({
  locale,
  copy,
}: {
  locale: string;
  copy: DashboardCopy;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          user?: PublicAuthUser | null;
          error?: string;
        };
        if (!alive) return;
        if (
          data.error === "auth_not_configured" ||
          data.error === "kv_not_configured" ||
          data.error === "auth_secret_not_configured"
        ) {
          setState({ kind: "not_configured" });
        } else {
          setState({ kind: "ready", user: data.user ?? null });
        }
      })
      .catch(() => {
        if (alive) setState({ kind: "ready", user: null });
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <DashboardShell copy={copy}>
        <StatusPanel tone="success" title="PRSLOY ID" body={copy.loading_body} />
      </DashboardShell>
    );
  }

  if (state.kind === "not_configured") {
    return (
      <DashboardShell copy={copy}>
        <StatusPanel tone="warning" title={copy.setup_title} body={copy.setup_body} />
      </DashboardShell>
    );
  }

  if (!state.user) {
    return (
      <DashboardShell copy={copy}>
        <RevealOnView delay={0.1}>
          <section className="border border-border-visible rounded-[8px] p-xl sm:p-2xl bg-surface flex flex-col gap-lg">
            <div className="flex items-center gap-sm">
              <span className="inline-block w-[6px] h-[6px] rounded-full bg-warning animate-pulse" />
              <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
                {copy.auth_required_label}
              </span>
            </div>
            <p className="font-body text-body text-text-secondary leading-[1.65]">
              {copy.auth_required_body}
            </p>
            <div className="flex flex-col sm:flex-row gap-sm">
              <Link
                href="/login"
                className="inline-flex items-center justify-center bg-text-display text-black
                           font-mono uppercase tracking-[0.08em] text-label px-xl min-h-[48px]
                           rounded-full whitespace-nowrap hover:opacity-90 transition-opacity"
              >
                [ {copy.login_link} ]
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center border border-border-visible
                           font-mono uppercase tracking-[0.08em] text-label text-text-display
                           px-xl min-h-[48px] rounded-full whitespace-nowrap hover:border-text-display transition-colors"
              >
                [ {copy.register_link} ]
              </Link>
            </div>
          </section>
        </RevealOnView>
      </DashboardShell>
    );
  }

  const user = state.user;
  const hasKey = Boolean(user.subscriptionUrl);
  const blocked = user.accessStatus === "blocked";
  const active = hasKey && user.accessStatus === "active";
  const createdAt = formatDashboardDate(user.createdAt, locale);
  const updatedAt = formatDashboardDate(user.updatedAt, locale);

  return (
    <DashboardShell copy={copy} user={user}>
      {!user.emailVerified && (
        <RevealOnView delay={0.1}>
          <StatusPanel tone="warning" title={copy.verify_title} body={copy.verify_body}>
            <ResendVerificationButton
              label={copy.verify_resend}
              sentLabel={copy.verify_sent}
              errorLabel={copy.verify_error}
              locale={locale}
            />
          </StatusPanel>
        </RevealOnView>
      )}

      <RevealOnView delay={0.12}>
        <AccessHero copy={copy} active={active} blocked={blocked} />
      </RevealOnView>

      <RevealOnView delay={0.15}>
        <section className="grid grid-cols-1 lg:grid-cols-[1.18fr_0.82fr] gap-md lg:items-start">
          <ConfigurationCard
            copy={copy}
            subscriptionUrl={user.subscriptionUrl}
            hasKey={hasKey}
          />
          <div className="grid grid-cols-1 gap-md">
            <NextStepCard copy={copy} hasKey={hasKey} />
            <ReissueCard copy={copy} hasKey={hasKey} />
            <SupportCard copy={copy} />
          </div>
        </section>
      </RevealOnView>

      <RevealOnView>
        <AccountCard
          copy={copy}
          user={user}
          hasKey={hasKey}
          createdAt={createdAt}
          updatedAt={updatedAt}
          locale={locale}
        />
      </RevealOnView>
    </DashboardShell>
  );
}

function DashboardShell({
  copy,
  user,
  children,
}: {
  copy: DashboardCopy;
  user?: PublicAuthUser;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-5xl mx-auto px-lg flex flex-col gap-2xl">
        <RevealOnView y={12}>
          <div className="flex flex-col gap-xl">
            <div className="flex items-center justify-between gap-md">
              <SectionLabel>{copy.label}</SectionLabel>
              {user && (
                <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled truncate max-w-[52vw]">
                  {user.email}
                </span>
              )}
            </div>
            <header className="grid gap-lg lg:grid-cols-[1fr_340px] lg:items-end">
              <h1
                className="font-body font-bold text-text-display leading-[0.95] tracking-[-0.03em] break-words"
                style={{ fontSize: "clamp(40px, 8vw, 84px)" }}
              >
                {copy.title}
              </h1>
              <p className="font-body text-body text-text-secondary leading-[1.55]">
                {copy.subtitle}
              </p>
            </header>
          </div>
        </RevealOnView>

        {children}
      </div>
    </main>
  );
}

function AccessHero({
  copy,
  active,
  blocked,
}: {
  copy: DashboardCopy;
  active: boolean;
  blocked: boolean;
}) {
  const title = blocked
    ? copy.status_blocked_title
    : active
      ? copy.status_ready_title
      : copy.status_pending_title;
  const body = blocked
    ? copy.status_blocked_body
    : active
      ? copy.status_ready_body
      : copy.status_pending_body;
  const tone = blocked ? "warning" : active ? "success" : "muted";

  return (
    <section className="relative overflow-hidden border border-border-visible rounded-[8px] bg-surface p-xl sm:p-2xl">
      <div aria-hidden="true" className="absolute inset-0 dot-grid-subtle opacity-40" />
      <div className="relative z-10 grid gap-xl lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="flex flex-col gap-md">
          <div className="flex items-center gap-sm">
            <StatusDot tone={tone} />
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
              {copy.access_label}
            </span>
          </div>
          <h2 className="font-body font-bold text-text-display text-heading leading-[1.05]">
            {title}
          </h2>
          <p className="font-body text-body text-text-secondary leading-[1.65] max-w-2xl">
            {body}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row lg:flex-col gap-sm lg:min-w-[220px]">
          <Link
            href="/setup"
            className="inline-flex min-h-[48px] items-center justify-center bg-text-display px-lg
                       font-mono text-label uppercase tracking-[0.08em] text-black
                       rounded-full hover:opacity-90 active:scale-[0.98] transition"
          >
            [ {copy.setup_link} ]
          </Link>
          <a
            href={TELEGRAM_BOT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[48px] items-center justify-center border border-border-visible px-lg
                       font-mono text-label uppercase tracking-[0.08em] text-text-display
                       rounded-full hover:border-text-display transition-colors"
          >
            [ {copy.support_link} ]
          </a>
        </div>
      </div>
    </section>
  );
}

function ConfigurationCard({
  copy,
  subscriptionUrl,
  hasKey,
}: {
  copy: DashboardCopy;
  subscriptionUrl: string | null;
  hasKey: boolean;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [revealed, setRevealed] = useState(false);

  async function copyAccessKey() {
    if (!subscriptionUrl) return;
    try {
      await navigator.clipboard.writeText(subscriptionUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className="border border-border-visible rounded-[8px] p-xl sm:p-2xl flex flex-col gap-lg">
      <div className="flex items-center justify-between gap-md">
        <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {copy.vpn_section_label}
        </span>
        <span className="font-mono text-label uppercase tracking-[0.1em] text-text-disabled">
          {hasKey ? copy.key_ready : copy.key_not_issued}
        </span>
      </div>

      <p className="font-body text-body text-text-secondary leading-[1.65]">
        {hasKey ? copy.key_ready_body : copy.key_pending_body}
      </p>

      {hasKey && subscriptionUrl ? (
        <>
          <div className="border border-border-visible bg-black p-md flex flex-col gap-sm">
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
              {copy.config_label}
            </span>
            <span className="font-mono text-body-sm text-text-display break-all leading-[1.6]">
              {revealed ? subscriptionUrl : maskAccessUrl(subscriptionUrl)}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-sm">
            <button
              type="button"
              onClick={copyAccessKey}
              className="inline-flex min-h-[44px] items-center justify-center bg-text-display px-lg
                         font-mono text-label uppercase tracking-[0.08em] text-black
                         hover:opacity-90 active:scale-[0.98] transition"
            >
              [ {copyState === "copied" ? copy.copy_done : copy.copy_key} ]
            </button>
            <button
              type="button"
              onClick={() => setRevealed((v) => !v)}
              className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-lg
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:border-text-display transition-colors"
            >
              [ {revealed ? copy.hide_key : copy.show_key} ]
            </button>
            <a
              href={subscriptionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-lg
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:border-text-display transition-colors"
            >
              [ {copy.open_key} ]
            </a>
          </div>
          {copyState === "error" && (
            <p className="font-body text-body-sm text-accent">{copy.copy_error}</p>
          )}
        </>
      ) : (
        <div className="border border-border-visible bg-black p-md flex items-center gap-md">
          <StatusDot tone="muted" />
          <span className="font-mono text-label uppercase tracking-[0.1em] text-text-disabled">
            {copy.config_label}
          </span>
        </div>
      )}
    </section>
  );
}

function NextStepCard({ copy, hasKey }: { copy: DashboardCopy; hasKey: boolean }) {
  return (
    <section className="border border-border-visible rounded-[8px] p-lg flex flex-col gap-md">
      <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
        {copy.next_label}
      </span>
      <h2 className="font-body font-bold text-text-display text-subheading leading-[1.15]">
        {hasKey ? copy.next_active_1_title : copy.next_pending_1_title}
      </h2>
      <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
        {hasKey ? copy.next_active_1_body : copy.next_pending_1_body}
      </p>
    </section>
  );
}

function ReissueCard({ copy, hasKey }: { copy: DashboardCopy; hasKey: boolean }) {
  return (
    <section className="border border-border-visible rounded-[8px] p-lg flex flex-col gap-md">
      <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
        {copy.reissue_title}
      </span>
      <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
        {copy.reissue_body}
      </p>
      <ReissueControl copy={copy} hasKey={hasKey} />
    </section>
  );
}

function SupportCard({ copy }: { copy: DashboardCopy }) {
  return (
    <section className="border border-border-visible rounded-[8px] p-lg flex flex-col gap-md">
      <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
        {copy.support_title}
      </span>
      <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
        {copy.support_body}
      </p>
      <a
        href={TELEGRAM_BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="self-start font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80 transition-opacity"
      >
        {copy.support_link} {"\u2192"}
      </a>
    </section>
  );
}

function AccountCard({
  copy,
  user,
  hasKey,
  createdAt,
  updatedAt,
  locale,
}: {
  copy: DashboardCopy;
  user: PublicAuthUser;
  hasKey: boolean;
  createdAt: string;
  updatedAt: string;
  locale: string;
}) {
  return (
    <section className="border-t border-border-visible pt-xl grid gap-md lg:grid-cols-[1fr_auto] lg:items-end">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
        <PlainMetric label={copy.email_label} value={user.email} />
        <PlainMetric
          label={copy.access_label}
          value={hasKey ? copy.access_active : copy.access_pending}
        />
        <PlainMetric label={copy.account_created_label} value={createdAt} />
        <PlainMetric label={copy.updated_label} value={updatedAt} />
      </div>
      <LogoutButton label={copy.logout} locale={locale} />
    </section>
  );
}

function ReissueControl({
  copy,
  hasKey,
}: {
  copy: DashboardCopy;
  hasKey: boolean;
}) {
  const [state, setState] = useState<ReissueState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function submit() {
    if (!hasKey || state === "sending" || state === "sent") return;
    setState("sending");
    setErrorMessage("");
    try {
      const res = await fetch("/api/access/reissue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        setState("sent");
        return;
      }
      setErrorMessage(
        data.error === "rate_limited"
          ? copy.reissue_rate_limited
          : data.error === "access_not_issued"
            ? copy.reissue_no_key
            : data.error === "authentication_required"
              ? copy.reissue_auth_required
              : copy.reissue_error_body
      );
      setState("error");
    } catch {
      setErrorMessage(copy.reissue_error_body);
      setState("error");
    }
  }

  const label =
    state === "sending"
      ? copy.reissue_sending
      : state === "sent"
        ? copy.reissue_sent
        : copy.reissue_button;

  return (
    <div className="flex flex-col gap-sm">
      {hasKey ? (
        <button
          type="button"
          onClick={submit}
          disabled={state === "sending" || state === "sent"}
          className="inline-flex min-h-[44px] items-center justify-center bg-text-display px-lg
                     font-mono text-label uppercase tracking-[0.08em] text-black
                     hover:opacity-90 active:scale-[0.98] transition
                     disabled:opacity-60 disabled:cursor-default disabled:active:scale-100"
        >
          [ {label} ]
        </button>
      ) : (
        <span className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-lg
                         font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
          [ {copy.reissue_disabled} ]
        </span>
      )}
      {state === "sent" && (
        <p className="font-body text-body-sm text-success leading-[1.55]">
          {copy.reissue_sent_body}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function StatusPanel({
  title,
  body,
  tone,
  children,
}: {
  title: string;
  body: string;
  tone: "warning" | "success";
  children?: React.ReactNode;
}) {
  return (
    <section className="border border-border-visible rounded-[8px] p-xl sm:p-2xl bg-surface flex flex-col gap-md">
      <div className="flex items-center gap-sm">
        <StatusDot tone={tone} />
        <h2 className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {title}
        </h2>
      </div>
      <p className="font-body text-body-sm text-text-secondary leading-[1.65]">{body}</p>
      {children}
    </section>
  );
}

function PlainMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-xs min-w-0">
      <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </span>
      <span className="font-mono text-[12px] uppercase tracking-[0.02em] text-text-display truncate">
        {value}
      </span>
    </div>
  );
}

function StatusDot({ tone }: { tone: "success" | "warning" | "muted" }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        tone === "success"
          ? "bg-success shadow-[0_0_12px_rgba(74,158,92,0.75)]"
          : tone === "warning"
            ? "bg-warning animate-pulse"
            : "bg-border-visible"
      }`}
    />
  );
}

function formatDashboardDate(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function maskAccessUrl(value: string) {
  const mask = "************";
  try {
    const url = new URL(value);
    if (url.origin !== "null") {
      return `${url.origin}${url.pathname.slice(0, 8)}${mask}`;
    }
    return `${url.protocol}//${url.host || url.pathname.slice(0, 8)}${mask}`;
  } catch {
    return `${value.slice(0, 12)}${mask}`;
  }
}
