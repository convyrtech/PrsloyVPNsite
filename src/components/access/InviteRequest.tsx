"use client";

import { useState } from "react";
import { INVITE_BOT_FALLBACK_URL } from "@/lib/links";

type Copy = {
  cta: string;
  collapse: string;
  intro: string;
  channelTg: string;
  channelTgHint: string;
  channelTgButton: string;
  channelEmail: string;
  channelEmailHint: string;
  emailPlaceholder: string;
  emailSubmit: string;
  emailSending: string;
  emailSent: string;
  emailInvalid: string;
  emailRateLimited: string;
  emailGeneric: string;
};

type EmailState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

export function InviteRequest({
  copy,
  botUrl = INVITE_BOT_FALLBACK_URL,
  defaultOpen = false,
}: {
  copy: Copy;
  botUrl?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [email, setEmail] = useState("");
  const [state, setState] = useState<EmailState>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === "sending") return;
    const trimmed = email.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setState({ kind: "error", message: copy.emailInvalid });
      return;
    }

    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/access/request-via-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        setState({ kind: "sent" });
        setEmail("");
        return;
      }
      if (data.error === "rate_limited" || res.status === 429) {
        setState({ kind: "error", message: copy.emailRateLimited });
        return;
      }
      if (data.error === "invalid_email") {
        setState({ kind: "error", message: copy.emailInvalid });
        return;
      }
      setState({ kind: "error", message: copy.emailGeneric });
    } catch {
      setState({ kind: "error", message: copy.emailGeneric });
    }
  }

  if (!open) {
    return (
      <section className="flex items-center justify-between gap-md py-md
                          border-y border-border-visible
                          font-mono text-label uppercase tracking-[0.08em]">
        <span className="text-text-disabled">{copy.intro}</span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center min-h-[44px] text-text-display
                     hover:opacity-80 transition-opacity"
        >
          {copy.cta} →
        </button>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-lg py-lg
                        border-y border-border-visible">
      <div className="flex items-center justify-between gap-md
                      font-mono text-label uppercase tracking-[0.08em]">
        <span className="text-text-display">{copy.cta}</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex items-center min-h-[44px] text-text-disabled
                     hover:text-text-display transition-colors"
        >
          {copy.collapse} ×
        </button>
      </div>

      {/* Telegram channel — primary, brand-aligned. */}
      <div className="flex flex-col gap-sm border border-border-visible
                      bg-surface p-lg">
        <div className="font-mono text-label uppercase tracking-[0.12em]
                        text-text-display">
          {copy.channelTg}
        </div>
        <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
          {copy.channelTgHint}
        </p>
        <a
          href={botUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start inline-flex items-center justify-center
                     bg-text-display text-black font-mono uppercase
                     tracking-[0.08em] px-xl min-h-[44px] rounded-full
                     text-label hover:opacity-90 active:scale-[0.98]
                     transition duration-150 ease-out-nothing"
        >
          [ {copy.channelTgButton} ]
        </a>
      </div>

      {/* Email channel — fallback for when Telegram is blocked. */}
      <div className="flex flex-col gap-sm border border-border-visible
                      bg-surface p-lg">
        <div className="font-mono text-label uppercase tracking-[0.12em]
                        text-text-display">
          {copy.channelEmail}
        </div>
        <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
          {copy.channelEmailHint}
        </p>

        {state.kind === "sent" ? (
          <p
            role="status"
            className="font-mono text-label uppercase tracking-[0.08em] text-text-display"
          >
            ✓ {copy.emailSent}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-sm">
            <input
              type="email"
              autoComplete="email"
              required
              placeholder={copy.emailPlaceholder}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state.kind === "error") setState({ kind: "idle" });
              }}
              disabled={state.kind === "sending"}
              className="flex-1 bg-black border border-border-visible
                         rounded-full px-lg min-h-[44px]
                         font-mono text-body-sm text-text-display
                         placeholder:text-text-disabled focus:outline-none
                         focus:border-text-display transition-colors
                         disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={state.kind === "sending"}
              className="inline-flex items-center justify-center
                         border border-border-visible
                         font-mono uppercase tracking-[0.08em] text-label
                         text-text-display px-xl min-h-[44px] rounded-full
                         hover:border-text-display active:scale-[0.98]
                         disabled:opacity-60 disabled:cursor-wait
                         transition duration-150 ease-out-nothing"
            >
              [ {state.kind === "sending" ? copy.emailSending : copy.emailSubmit} ]
            </button>
          </form>
        )}

        {state.kind === "error" && (
          <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
            {state.message}
          </p>
        )}
      </div>
    </section>
  );
}
