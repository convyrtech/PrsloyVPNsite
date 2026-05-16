"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Link } from "@/i18n/routing";
import { LogoutButton, ResendVerificationButton } from "@/components/auth/AccountActions";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { RevealOnView } from "@/components/ui/RevealOnView";
import { DotoNumber } from "@/components/ui/DotoNumber";
import type { PublicAuthUser } from "@/lib/auth";

export type DashboardCopy = Record<
  | "label"
  | "title"
  | "setup_title"
  | "setup_body"
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
  | "email_status_label"
  | "email_verified"
  | "email_pending"
  | "access_label"
  | "access_active"
  | "access_pending"
  | "key_label"
  | "key_ready"
  | "key_not_issued"
  | "vpn_section_label"
  | "key_ready_body"
  | "key_pending_body"
  | "pipeline_label"
  | "progress_email"
  | "progress_invite"
  | "progress_access"
  | "state_done"
  | "state_current"
  | "state_waiting"
  | "updated_label"
  | "copy_key"
  | "copy_done"
  | "copy_error"
  | "setup_link"
  | "ready_hint_label"
  | "pending_hint_label"
  | "account_label"
  | "logout",
  string
>;

type State =
  | { kind: "loading" }
  | { kind: "not_configured" }
  | { kind: "ready"; user: PublicAuthUser | null };

type AccessStep = {
  label: string;
  state: "done" | "current" | "waiting";
};

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
      <DashboardShell locale={locale} copy={copy}>
        <StatusPanel tone="success" title="PRSLOY ID" body="Loading account..." />
      </DashboardShell>
    );
  }

  if (state.kind === "not_configured") {
    return (
      <DashboardShell locale={locale} copy={copy}>
        <StatusPanel tone="warning" title={copy.setup_title} body={copy.setup_body} />
      </DashboardShell>
    );
  }

  if (!state.user) {
    return (
      <DashboardShell locale={locale} copy={copy}>
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
  const accessActive = user.accessStatus === "active";
  const updatedAt = formatDashboardDate(user.updatedAt, locale);
  const progress = hasKey ? 100 : accessActive ? 75 : user.emailVerified ? 50 : 18;
  const steps: AccessStep[] = [
    {
      label: copy.progress_email,
      state: user.emailVerified ? "done" : "current",
    },
    {
      label: copy.progress_invite,
      state: user.emailVerified ? (accessActive ? "done" : "current") : "waiting",
    },
    {
      label: copy.progress_access,
      state: hasKey ? "done" : "waiting",
    },
  ];

  return (
    <DashboardShell locale={locale} copy={copy} user={user}>
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

      <RevealOnView delay={0.15}>
        <section className="grid grid-cols-1 lg:grid-cols-[1.12fr_0.88fr] gap-md">
          <AccessTimeline
            label={copy.pipeline_label}
            steps={steps}
            progress={progress}
            copy={copy}
          />
          <IdentityPanel
            copy={copy}
            user={user}
            hasKey={hasKey}
            updatedAt={updatedAt}
          />
        </section>
      </RevealOnView>

      <RevealOnView>
        <AccessPanel copy={copy} subscriptionUrl={user.subscriptionUrl} hasKey={hasKey} />
      </RevealOnView>

      <RevealOnView>
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md">
          <InfoTile label={copy.email_label} value={user.email} />
          <InfoTile
            label={copy.email_status_label}
            value={user.emailVerified ? copy.email_verified : copy.email_pending}
            tone={user.emailVerified ? "success" : "warning"}
          />
          <InfoTile
            label={copy.access_label}
            value={accessActive ? copy.access_active : copy.access_pending}
            tone={accessActive ? "success" : "warning"}
          />
          <InfoTile
            label={copy.key_label}
            value={hasKey ? copy.key_ready : copy.key_not_issued}
            tone={hasKey ? "success" : "muted"}
          />
        </section>
      </RevealOnView>

      <RevealOnView>
        <div className="pt-xl border-t border-border-visible flex items-center justify-between gap-md
                        font-mono text-label uppercase tracking-[0.08em]">
          <span className="text-text-disabled">{copy.account_label}</span>
          <LogoutButton label={copy.logout} locale={locale} />
        </div>
      </RevealOnView>
    </DashboardShell>
  );
}

function DashboardShell({
  children,
  locale,
  copy,
  user,
}: {
  children: React.ReactNode;
  locale: string;
  copy: DashboardCopy;
  user?: PublicAuthUser;
}) {
  const unit = user ? "USER" : locale.toUpperCase();

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-3xl mx-auto px-lg flex flex-col gap-3xl">
        <RevealOnView y={12}>
          <SectionLabel>{copy.label}</SectionLabel>
        </RevealOnView>

        <RevealOnView delay={0.05}>
          <header className="flex flex-col gap-lg">
            <div className="flex flex-col gap-md sm:flex-row sm:items-end sm:justify-between sm:gap-lg">
              <h1
                className="font-body font-bold text-text-display leading-[0.95] tracking-[-0.03em] break-words sm:flex-1 sm:min-w-0"
                style={{ fontSize: "clamp(36px, 7vw, 72px)" }}
              >
                {copy.title}
              </h1>
              <DotoNumber value={user ? "01" : "00"} unit={unit} />
            </div>
          </header>
        </RevealOnView>

        {children}
      </div>
    </main>
  );
}

function AccessTimeline({
  label,
  steps,
  progress,
  copy,
}: {
  label: string;
  steps: AccessStep[];
  progress: number;
  copy: DashboardCopy;
}) {
  return (
    <section className="relative overflow-hidden border border-border-visible rounded-[8px] bg-surface p-xl sm:p-2xl min-h-[280px]">
      <motion.div
        aria-hidden="true"
        className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent"
        animate={{ x: ["0%", "420%"] }}
        transition={{ duration: 4.8, repeat: Infinity, ease: "linear" }}
      />
      <div className="relative z-10 flex flex-col gap-xl">
        <div className="flex items-center justify-between gap-lg">
          <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
            {label}
          </span>
          <span className="font-mono text-label uppercase tracking-[0.12em] text-text-display tabular-nums">
            {progress}%
          </span>
        </div>

        <div className="h-[2px] bg-border-visible overflow-hidden">
          <motion.div
            className="h-full bg-text-display"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
          />
        </div>

        <ol className="flex flex-col gap-lg">
          {steps.map((step, index) => (
            <li key={step.label} className="grid grid-cols-[32px_1fr_auto] items-center gap-md">
              <StepMarker state={step.state} index={index + 1} />
              <span className="font-body text-body-sm text-text-primary leading-[1.35]">
                {step.label}
              </span>
              <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
                {step.state === "done"
                  ? copy.state_done
                  : step.state === "current"
                    ? copy.state_current
                    : copy.state_waiting}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function StepMarker({ state, index }: { state: AccessStep["state"]; index: number }) {
  const active = state === "current";
  const done = state === "done";

  return (
    <span
      className={`relative flex h-8 w-8 items-center justify-center border font-mono text-[10px] tabular-nums ${
        done
          ? "border-text-display bg-text-display text-black"
          : active
            ? "border-warning text-warning"
            : "border-border-visible text-text-disabled"
      }`}
    >
      {active && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-[-5px] border border-warning/40"
          animate={{ opacity: [0.2, 0.75, 0.2], scale: [0.92, 1.08, 0.92] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      {done ? "OK" : String(index).padStart(2, "0")}
    </span>
  );
}

function IdentityPanel({
  copy,
  user,
  hasKey,
  updatedAt,
}: {
  copy: DashboardCopy;
  user: PublicAuthUser;
  hasKey: boolean;
  updatedAt: string;
}) {
  const accessValue =
    user.accessStatus === "active"
      ? copy.access_active
      : user.emailVerified
        ? copy.access_pending
        : copy.email_pending;

  return (
    <section className="border border-border-visible rounded-[8px] p-xl sm:p-2xl flex flex-col gap-xl">
      <div className="flex items-start justify-between gap-lg">
        <div className="flex flex-col gap-xs min-w-0">
          <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
            PRSLOY ID
          </span>
          <span className="font-body font-bold text-text-display text-heading break-words">
            {accessValue}
          </span>
        </div>
        <span
          className={`mt-1 inline-block h-3 w-3 shrink-0 rounded-full ${
            hasKey ? "bg-success shadow-[0_0_14px_rgba(74,158,92,0.8)]" : "bg-warning animate-pulse"
          }`}
        />
      </div>

      <div className="grid grid-cols-2 gap-md">
        <MiniStat label={copy.email_status_label} value={user.emailVerified ? copy.email_verified : copy.email_pending} />
        <MiniStat label={copy.key_label} value={hasKey ? copy.key_ready : copy.key_not_issued} />
        <MiniStat label={copy.updated_label} value={updatedAt} wide />
      </div>

      <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
        {hasKey ? copy.ready_hint_label : copy.pending_hint_label}
      </p>
    </section>
  );
}

function MiniStat({ label, value, wide = false }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={`border-t border-border-visible pt-sm ${wide ? "col-span-2" : ""}`}>
      <div className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
        {label}
      </div>
      <div className="mt-xs font-mono text-[12px] uppercase tracking-[0.02em] text-text-display whitespace-nowrap overflow-hidden text-ellipsis">
        {value}
      </div>
    </div>
  );
}

function AccessPanel({
  copy,
  subscriptionUrl,
  hasKey,
}: {
  copy: DashboardCopy;
  subscriptionUrl: string | null;
  hasKey: boolean;
}) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

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
      <div className="flex items-center gap-md">
        <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {copy.vpn_section_label}
        </span>
        <span className="h-px flex-1 bg-border-visible/40" />
      </div>

      {hasKey && subscriptionUrl ? (
        <div className="flex flex-col gap-lg">
          <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
            {copy.key_ready_body}
          </p>
          <div className="border border-border-visible bg-black p-md font-mono text-body-sm text-text-display break-all leading-[1.6]">
            {subscriptionUrl}
          </div>
          <div className="flex flex-col sm:flex-row gap-sm">
            <button
              type="button"
              onClick={copyAccessKey}
              className="inline-flex min-h-[44px] items-center justify-center bg-text-display px-lg
                         font-mono text-label uppercase tracking-[0.08em] text-black
                         hover:opacity-90 active:scale-[0.98] transition-all"
            >
              [ {copyState === "copied" ? copy.copy_done : copy.copy_key} ]
            </button>
            <Link
              href="/setup"
              className="inline-flex min-h-[44px] items-center justify-center border border-border-visible px-lg
                         font-mono text-label uppercase tracking-[0.08em] text-text-display
                         hover:border-text-display transition-colors"
            >
              [ {copy.setup_link} ]
            </Link>
          </div>
          {copyState === "error" && (
            <p className="font-body text-body-sm text-accent">{copy.copy_error}</p>
          )}
        </div>
      ) : (
        <p className="font-body text-body text-text-secondary leading-[1.65]">
          {copy.key_pending_body}
        </p>
      )}
    </section>
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
        <span
          className={`inline-block w-[6px] h-[6px] rounded-full animate-pulse ${
            tone === "success" ? "bg-success" : "bg-warning"
          }`}
        />
        <h2 className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {title}
        </h2>
      </div>
      <p className="font-body text-body-sm text-text-secondary leading-[1.65]">{body}</p>
      {children}
    </section>
  );
}

function InfoTile({
  label,
  value,
  tone = "muted",
}: {
  label: string;
  value: string;
  tone?: "success" | "warning" | "muted";
}) {
  return (
    <article className="border border-border-visible rounded-[8px] p-lg flex flex-col gap-sm min-h-[116px]">
      <div className="flex items-center gap-sm">
        {tone !== "muted" && (
          <span
            className={`inline-block w-[6px] h-[6px] rounded-full ${
              tone === "success" ? "bg-success" : "bg-warning animate-pulse"
            }`}
          />
        )}
        <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
          {label}
        </span>
      </div>
      <p className="font-body font-bold text-text-display text-subheading leading-[1.3] break-words">
        {value}
      </p>
    </article>
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
