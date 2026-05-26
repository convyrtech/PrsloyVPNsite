"use client";

import { useEffect, useState } from "react";

type Copy = {
  title: string;
  body: string;
  timerLabel: string;
  timerDays: string;
  timerHours: string;
  timerMinutes: string;
  timerExpired: string;
  formLabel: string;
  formPlaceholder: string;
  formSubmit: string;
  formSending: string;
  formSent: string;
  formInvalid: string;
  formGeneric: string;
  vipLabel: string;
  vipCta: string;
};

type FormState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

function isValidEmailOrHandle(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // @username (Telegram) — 5-32 chars, letters/digits/underscore
  if (/^@[A-Za-z0-9_]{5,32}$/.test(v)) return true;
  // email — basic shape
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return true;
  return false;
}

function computeRemaining(targetIso: string): {
  total: number;
  days: number;
  hours: number;
  minutes: number;
  expired: boolean;
} {
  const target = new Date(targetIso).getTime();
  const now = Date.now();
  const total = Math.max(0, target - now);
  const days = Math.floor(total / (1000 * 60 * 60 * 24));
  const hours = Math.floor((total / (1000 * 60 * 60)) % 24);
  const minutes = Math.floor((total / (1000 * 60)) % 60);
  return { total, days, hours, minutes, expired: total <= 0 };
}

export function PoolFullPanel({
  copy,
  expansionAtIso,
  vipContactUrl,
}: {
  copy: Copy;
  expansionAtIso: string;
  vipContactUrl: string;
}) {
  const [remaining, setRemaining] = useState(() => computeRemaining(expansionAtIso));
  const [contact, setContact] = useState("");
  const [state, setState] = useState<FormState>({ kind: "idle" });

  useEffect(() => {
    // Tick every 60s — minute-level granularity is enough for the
    // "DD ДНЕЙ · HH ЧАСОВ · MM МИНУТ" display, and avoids re-rendering
    // the whole panel every second.
    const id = setInterval(() => {
      setRemaining(computeRemaining(expansionAtIso));
    }, 60_000);
    return () => clearInterval(id);
  }, [expansionAtIso]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state.kind === "sending") return;
    const value = contact.trim();
    if (!isValidEmailOrHandle(value)) {
      setState({ kind: "error", message: copy.formInvalid });
      return;
    }
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/access/notify-when-open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact: value }),
      });
      if (res.ok) {
        setState({ kind: "sent" });
        setContact("");
      } else {
        setState({ kind: "error", message: copy.formGeneric });
      }
    } catch {
      setState({ kind: "error", message: copy.formGeneric });
    }
  }

  return (
    <section className="flex flex-col gap-xl border border-border-visible bg-surface
                        p-xl sm:p-2xl">
      {/* Title + body */}
      <div className="flex flex-col gap-md">
        <div className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {copy.title}
        </div>
        <p className="font-body text-body text-text-secondary leading-[1.55] max-w-md">
          {copy.body}
        </p>
      </div>

      {/* Timer */}
      <div className="flex flex-col gap-sm">
        <div className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
          {copy.timerLabel}
        </div>
        {remaining.expired ? (
          <div className="font-mono text-body uppercase tracking-[0.08em] text-text-display">
            {copy.timerExpired}
          </div>
        ) : (
          <div
            className="font-mono font-bold text-text-display tabular-nums tracking-[0.04em]"
            style={{ fontSize: "clamp(24px, 4vw, 36px)" }}
          >
            <span>{String(remaining.days).padStart(2, "0")}</span>{" "}
            <span className="text-text-disabled font-normal">{copy.timerDays}</span>{" "}
            <span className="text-text-secondary">·</span>{" "}
            <span>{String(remaining.hours).padStart(2, "0")}</span>{" "}
            <span className="text-text-disabled font-normal">{copy.timerHours}</span>{" "}
            <span className="text-text-secondary">·</span>{" "}
            <span>{String(remaining.minutes).padStart(2, "0")}</span>{" "}
            <span className="text-text-disabled font-normal">{copy.timerMinutes}</span>
          </div>
        )}
      </div>

      {/* Form: notify on expand */}
      <div className="flex flex-col gap-sm border-t border-border-visible pt-lg">
        <div className="font-mono text-label uppercase tracking-[0.12em] text-text-display">
          {copy.formLabel}
        </div>
        {state.kind === "sent" ? (
          <p
            role="status"
            className="font-mono text-label uppercase tracking-[0.08em] text-text-display"
          >
            ✓ {copy.formSent}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-sm">
            <input
              type="text"
              autoComplete="off"
              required
              placeholder={copy.formPlaceholder}
              value={contact}
              onChange={(e) => {
                setContact(e.target.value);
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
              [ {state.kind === "sending" ? copy.formSending : copy.formSubmit} ]
            </button>
          </form>
        )}
        {state.kind === "error" && (
          <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
            {state.message}
          </p>
        )}
      </div>

      {/* VIP escape — direct contact to founder for "don't want to wait" */}
      <div className="flex items-center justify-between gap-md border-t border-border-visible pt-lg">
        <div className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
          {copy.vipLabel}
        </div>
        <a
          href={vipContactUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center min-h-[44px] text-text-display
                     hover:opacity-80 transition-opacity
                     font-mono text-label uppercase tracking-[0.08em]"
        >
          {copy.vipCta} →
        </a>
      </div>
    </section>
  );
}
