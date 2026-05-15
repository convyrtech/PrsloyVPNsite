"use client";

import { useEffect, useState } from "react";
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
  | "account_label"
  | "logout",
  string
>;

type State =
  | { kind: "loading" }
  | { kind: "not_configured" }
  | { kind: "ready"; user: PublicAuthUser | null };

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
        if (data.error === "auth_not_configured") {
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
          <section className="border border-border-visible rounded-[24px] p-xl sm:p-2xl bg-surface flex flex-col gap-lg">
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
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-md">
          <InfoTile label={copy.email_label} value={user.email} />
          <InfoTile
            label={copy.email_status_label}
            value={user.emailVerified ? copy.email_verified : copy.email_pending}
            pulse={!user.emailVerified}
          />
          <InfoTile
            label={copy.access_label}
            value={user.accessStatus === "active" ? copy.access_active : copy.access_pending}
            pulse={user.accessStatus !== "active"}
          />
          <InfoTile label={copy.key_label} value={hasKey ? copy.key_ready : copy.key_not_issued} />
        </section>
      </RevealOnView>

      <RevealOnView>
        <section className="border border-border-visible rounded-[24px] p-xl sm:p-2xl flex flex-col gap-lg">
          <div className="flex items-center gap-md">
            <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
              {copy.vpn_section_label}
            </span>
            <span className="h-px flex-1 bg-border-visible/40" />
          </div>

          {hasKey ? (
            <div className="flex flex-col gap-md">
              <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
                {copy.key_ready_body}
              </p>
              <a
                href={user.subscriptionUrl || "#"}
                className="font-mono text-body-sm text-text-display break-all hover:opacity-80"
              >
                {user.subscriptionUrl}
              </a>
            </div>
          ) : (
            <p className="font-body text-body text-text-secondary leading-[1.65]">
              {copy.key_pending_body}
            </p>
          )}
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
    <section className="border border-border-visible rounded-[24px] p-xl sm:p-2xl bg-surface flex flex-col gap-md">
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
  pulse,
}: {
  label: string;
  value: string;
  pulse?: boolean;
}) {
  return (
    <article className="border border-border-visible rounded-[16px] p-lg flex flex-col gap-sm min-h-[116px]">
      <div className="flex items-center gap-sm">
        {pulse && <span className="inline-block w-[6px] h-[6px] rounded-full bg-warning animate-pulse" />}
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
