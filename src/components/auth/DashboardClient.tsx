"use client";

import { Suspense, useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import { LogoutButton, ResendVerificationButton } from "@/components/auth/AccountActions";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { TELEGRAM_BOT_URL } from "@/lib/links";
import type { PublicAuthUser } from "@/lib/auth";
import { displayIdentity } from "@/lib/identity";
import { PaymentStatusCard } from "@/components/payments/PaymentStatusCard";
import { PaymentResultBanner } from "@/components/payments/PaymentResultBanner";

export type DashboardCopy = Record<
  | "label"
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
  | "access_label"
  | "status_ready_title"
  | "status_ready_body"
  | "status_pending_title"
  | "status_pending_body"
  | "status_blocked_title"
  | "status_blocked_body"
  | "key_ready_body"
  | "key_pending_body"
  | "copy_key"
  | "copy_done"
  | "copy_error"
  | "show_key"
  | "hide_key"
  | "setup_link"
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
  | "support_body"
  | "support_link"
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

    async function fetchMe() {
      try {
        const res = await fetch("/api/auth/me", { cache: "no-store" });
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
      } catch {
        // On refetch we keep whatever data we already have; only the
        // initial load downgrades to "no user" so the login UI appears.
        if (!alive) return;
        setState((prev) =>
          prev.kind === "loading" ? { kind: "ready", user: null } : prev
        );
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") fetchMe();
    }

    fetchMe();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
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
        <div className="min-h-[58vh] sm:min-h-0 flex items-center">
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
        </div>
      </DashboardShell>
    );
  }

  const user = state.user;
  const hasKey = Boolean(user.subscriptionUrl);
  const blocked = user.accessStatus === "blocked";
  const active = hasKey && user.accessStatus === "active";

  return (
    <DashboardShell copy={copy} user={user}>
      {user.email && !user.emailVerified && (
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
        <FloatingHero copy={copy} active={active} blocked={blocked} />
      </RevealOnView>

      {hasKey && user.subscriptionUrl && !blocked && (
        <RevealOnView delay={0.15}>
          <KeyBlock copy={copy} subscriptionUrl={user.subscriptionUrl} />
        </RevealOnView>
      )}

      <RevealOnView delay={0.18}>
        <PaymentStatusCard locale={locale} />
      </RevealOnView>

      <RevealOnView delay={0.2}>
        <UtilityFooter copy={copy} hasKey={hasKey && !blocked} locale={locale} />
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
      <div className="max-w-3xl mx-auto px-lg flex flex-col gap-2xl">
        <Suspense>
          <PaymentResultBanner />
        </Suspense>
        <RevealOnView y={12}>
          <div className="flex items-center justify-between gap-md">
            <SectionLabel>{copy.label}</SectionLabel>
            {user && (
              <span className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled truncate max-w-[52vw]">
                {displayIdentity(user)}
              </span>
            )}
          </div>
        </RevealOnView>

        {children}
      </div>
    </main>
  );
}

// Floating hero — no card, no surface, no backdrop. Just dot + heading + body
// + two CTAs. Per Nothing §2.4 the most important element should not be boxed.
function FloatingHero({
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
    <section className="flex flex-col gap-md">
      <div className="flex items-center gap-sm">
        <StatusDot tone={tone} />
        <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {copy.access_label}
        </span>
      </div>
      <h1 className="font-body font-bold text-text-display text-heading leading-[1.05]">
        {title}
      </h1>
      <p className="font-body text-body text-text-secondary leading-[1.65] max-w-2xl">
        {body}
      </p>
      <div className="mt-sm flex flex-col sm:flex-row gap-sm">
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
    </section>
  );
}

// KEY block — separator label + monospace URL + inline action row. No box.
function KeyBlock({
  copy,
  subscriptionUrl,
}: {
  copy: DashboardCopy;
  subscriptionUrl: string;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [revealed, setRevealed] = useState(false);

  async function copyAccessKey() {
    try {
      await navigator.clipboard.writeText(subscriptionUrl);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 1600);
    } catch {
      setCopyState("error");
    }
  }

  return (
    <section className="flex flex-col gap-md">
      <SeparatorLabel>KEY</SeparatorLabel>
      <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
        {copy.key_ready_body}
      </p>
      {revealed ? (
        // Single-line horizontal scroll so a long URL stays one line.
        <span className="font-mono text-body-sm text-text-display leading-[1.6]
                         block max-w-full overflow-x-auto whitespace-nowrap py-sm">
          {subscriptionUrl}
        </span>
      ) : (
        <span className="font-mono text-body-sm text-text-display leading-[1.6] break-all py-sm">
          {maskAccessUrl(subscriptionUrl)}
        </span>
      )}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-sm">
        <button
          type="button"
          onClick={copyAccessKey}
          className="inline-flex min-h-[44px] items-center justify-center bg-text-display px-lg
                     font-mono text-label uppercase tracking-[0.08em] text-black rounded-full
                     hover:opacity-90 active:scale-[0.98] transition"
        >
          [ {copyState === "copied" ? copy.copy_done : copy.copy_key} ]
        </button>
        <button
          type="button"
          onClick={() => setRevealed((v) => !v)}
          className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-lg
                     font-mono text-label uppercase tracking-[0.08em] text-text-display rounded-full
                     hover:border-text-display transition-colors"
        >
          [ {revealed ? copy.hide_key : copy.show_key} ]
        </button>
      </div>
      {copyState === "error" && (
        <p role="alert" className="font-body text-body-sm text-accent">{copy.copy_error}</p>
      )}
    </section>
  );
}

// UTILITY footer — reissue request, support link, logout. Compressed into
// label-link rows instead of three separate cards.
function UtilityFooter({
  copy,
  hasKey,
  locale,
}: {
  copy: DashboardCopy;
  hasKey: boolean;
  locale: string;
}) {
  // Hide ReissueRow entirely when the user has no key yet — 'нужно
  // перевыпустить ключ?' is a question only key-holders can answer.
  return (
    <section className="flex flex-col gap-md pt-xl border-t border-border-visible">
      {hasKey && <ReissueRow copy={copy} />}
      <SupportRow copy={copy} />
      <div className="flex justify-end pt-md">
        <LogoutButton label={copy.logout} locale={locale} />
      </div>
    </section>
  );
}

function ReissueRow({ copy }: { copy: DashboardCopy }) {
  const [state, setState] = useState<ReissueState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // Re-enable the button 30s after a successful submit. The server enforces
  // a 3/hour rate limit, so honest retries are safe; a sticky 'sent' state
  // is just dead UI that forces a page reload.
  useEffect(() => {
    if (state !== "sent") return;
    const timeout = window.setTimeout(() => setState("idle"), 30000);
    return () => window.clearTimeout(timeout);
  }, [state]);

  async function submit() {
    if (state === "sending" || state === "sent") return;
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

  const buttonLabel =
    state === "sending"
      ? copy.reissue_sending
      : state === "sent"
        ? copy.reissue_sent
        : copy.reissue_button;

  return (
    <div className="flex flex-col gap-xs">
      <div className="flex items-center justify-between gap-md font-mono text-label uppercase tracking-[0.08em]">
        <span className="text-text-secondary">{copy.reissue_body}</span>
        <button
          type="button"
          onClick={submit}
          disabled={state === "sending" || state === "sent"}
          className="inline-flex items-center min-h-[44px] text-text-display
                     hover:opacity-80 disabled:opacity-50 disabled:cursor-default
                     transition-opacity whitespace-nowrap"
        >
          {buttonLabel} {"→"}
        </button>
      </div>
      {state === "sent" && (
        <p className="font-mono text-label uppercase tracking-[0.08em] text-success">
          {copy.reissue_sent_body}
        </p>
      )}
      {state === "error" && (
        <p role="alert" className="font-mono text-label uppercase tracking-[0.08em] text-accent">
          {errorMessage}
        </p>
      )}
    </div>
  );
}

function SupportRow({ copy }: { copy: DashboardCopy }) {
  return (
    <div className="flex items-center justify-between gap-md font-mono text-label uppercase tracking-[0.08em]">
      <span className="text-text-secondary">{copy.support_body}</span>
      <a
        href={TELEGRAM_BOT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center min-h-[44px] text-text-display hover:opacity-80 transition-opacity whitespace-nowrap"
      >
        {copy.support_link} {"→"}
      </a>
    </div>
  );
}

function SeparatorLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-md font-mono text-label uppercase tracking-[0.16em]">
      <span className="text-text-display">{children}</span>
      <span className="flex-1 h-px bg-border-visible/40" />
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

function StatusDot({ tone }: { tone: "success" | "warning" | "muted" }) {
  // Success state uses the site-wide pulse-dot keyframe (same one as the
  // header status badge) for a slow breathing ring.
  if (tone === "success") {
    return <span className="relative inline-flex h-2 w-2 rounded-full pulse-dot" />;
  }
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${
        tone === "warning" ? "bg-warning animate-pulse" : "bg-border-visible"
      }`}
    />
  );
}

// Masked form of the subscription URL for the hidden state. The host is the
// same for every user (not secret) — only the path token is. So show the host
// and replace the entire token with a fixed run of dots: no last-N leak, and
// the dots actually stand in for the hidden part instead of looking like
// decoration glued onto a visible tail.
function maskAccessUrl(value: string) {
  const dots = "•".repeat(16);
  try {
    const url = new URL(value);
    const host = url.origin !== "null" ? url.origin : `${url.protocol}//${url.host}`;
    return `${host}/${dots}`;
  } catch {
    return dots;
  }
}
