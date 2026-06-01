"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { readUtmSource } from "@/lib/client-utm";

export type TelegramButtonCopy = {
  button: string;
  awaiting: string;
  awaitingHint: string;
  reopen: string;
  inviteLabel: string;
  invitePlaceholder: string;
  inviteRequired: string;
  inviteInvalid: string;
  inviteConsumed: string;
  expired: string;
  consumed: string;
  notConfigured: string;
  rateLimited: string;
  telegramIdTaken: string;
  generic: string;
};

type Props = {
  mode: "login" | "register";
  locale: string;
  copy: TelegramButtonCopy;
};

type State =
  | { kind: "idle" }
  | { kind: "awaiting"; nonce: string; deepLink: string; startedAt: number }
  | { kind: "error"; message: string };

// Adaptive backoff: first few polls quick (most confirms land in <10s),
// then space out. 1+2+3+5*N caps the budget; combined with the
// wall-clock timeout below, a single attempt costs ~25 KV reads max.
const POLL_DELAYS_MS = [1000, 2000, 3000, 5000];
const POLL_TIMEOUT_MS = 90_000;

// Outer wrapper provides the Suspense boundary required by
// useSearchParams. The inner component reads ?code= so a magic-link
// from email lands with both the email form AND the Telegram-side
// invite field prefilled — mirrors the AuthForm pattern.
export function TelegramAuthButton(props: Props) {
  return (
    <Suspense
      fallback={
        <TelegramAuthButtonInner {...props} initialInviteCode="" />
      }
    >
      <TelegramAuthButtonWithSearchParams {...props} />
    </Suspense>
  );
}

function TelegramAuthButtonWithSearchParams(props: Props) {
  const params = useSearchParams();
  const initialInviteCode = params.get("code")?.trim() ?? "";
  return (
    <TelegramAuthButtonInner {...props} initialInviteCode={initialInviteCode} />
  );
}

function TelegramAuthButtonInner({
  mode,
  locale,
  copy,
  initialInviteCode,
}: Props & { initialInviteCode: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "idle" });
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const timerRef = useRef<number | null>(null);
  const aliveRef = useRef(true);
  // Latest state + poll fn exposed to the visibilitychange listener, which is
  // registered once but must read the live state and call the freshest closure
  // (so the invite code typed before opening Telegram is the one that's sent).
  const stateRef = useRef<State>(state);
  stateRef.current = state;
  const pollOnceRef = useRef<
    (nonce: string, attempt: number, startedAt: number) => Promise<void>
  >(async () => {});

  // Sync field if the URL param changes while the page is mounted
  // (e.g. user clicks a different magic-link without full reload).
  useEffect(() => {
    if (initialInviteCode) setInviteCode(initialInviteCode);
  }, [initialInviteCode]);

  useEffect(() => {
    return () => {
      aliveRef.current = false;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  // Coming back to this tab after confirming in Telegram (especially on mobile,
  // where the backgrounded tab's poll timer gets suspended) fires an immediate
  // check — login completes the moment the user returns, instead of them
  // assuming nothing happened and trying to sign in again.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const s = stateRef.current;
      if (s.kind !== "awaiting") return;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      void pollOnceRef.current(s.nonce, 0, s.startedAt);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  function scheduleNextPoll(nonce: string, attempt: number, startedAt: number) {
    const delay =
      POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)];
    timerRef.current = window.setTimeout(() => {
      if (!aliveRef.current) return;
      void pollOnce(nonce, attempt + 1, startedAt);
    }, delay);
  }

  async function pollOnce(nonce: string, attempt: number, startedAt: number) {
    if (!aliveRef.current) return;
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      setState({ kind: "error", message: copy.expired });
      return;
    }

    try {
      const utmSource = mode === "register" ? readUtmSource() : undefined;
      const res = await fetch("/api/auth/telegram/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nonce,
          inviteCode: mode === "register" ? inviteCode.trim() : undefined,
          ...(utmSource ? { utmSource } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };

      if (res.ok && data.ok) {
        router.push(
          `/${locale}/dashboard${mode === "register" ? "?registered=1" : ""}`
        );
        router.refresh();
        return;
      }

      if (res.status === 202 && data.status === "pending") {
        scheduleNextPoll(nonce, attempt, startedAt);
        return;
      }

      setState({ kind: "error", message: mapError(data.error, copy) });
    } catch {
      setState({ kind: "error", message: copy.generic });
    }
  }
  pollOnceRef.current = pollOnce;

  async function onStart() {
    if (state.kind === "awaiting") return;
    setState({ kind: "idle" });

    if (mode === "register" && !inviteCode.trim()) {
      setState({ kind: "error", message: copy.inviteRequired });
      return;
    }

    try {
      const res = await fetch("/api/auth/telegram/init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        nonce?: string;
        deepLink?: string;
        error?: string;
      };

      if (!res.ok || !data.ok || !data.nonce || !data.deepLink) {
        setState({ kind: "error", message: mapError(data.error, copy) });
        return;
      }

      // Open Telegram in a new tab so the polling JS on this page keeps
      // running while the user taps "confirm" in the bot.
      window.open(data.deepLink, "_blank", "noopener,noreferrer");
      const startedAt = Date.now();
      setState({
        kind: "awaiting",
        nonce: data.nonce,
        deepLink: data.deepLink,
        startedAt,
      });
      scheduleNextPoll(data.nonce, 0, startedAt);
    } catch {
      setState({ kind: "error", message: copy.generic });
    }
  }

  const buttonLabel =
    state.kind === "awaiting" ? copy.awaiting : copy.button;

  return (
    <div className="flex flex-col gap-md">
      {mode === "register" && (
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
            {copy.inviteLabel}
          </span>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder={copy.invitePlaceholder}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            disabled={state.kind === "awaiting"}
            className="bg-surface border border-border-visible rounded-full px-lg min-h-[48px]
                       font-mono text-body-sm text-text-display placeholder:text-text-disabled
                       focus:outline-none focus:border-text-display transition-colors
                       disabled:opacity-60"
          />
        </label>
      )}

      <button
        type="button"
        onClick={onStart}
        disabled={state.kind === "awaiting"}
        className="bg-text-display text-black font-mono uppercase tracking-[0.08em]
                   px-xl min-h-[48px] inline-flex items-center justify-center rounded-full text-label
                   hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait
                   transition duration-150 ease-out-nothing"
      >
        [ {buttonLabel} ]
      </button>

      {state.kind === "awaiting" && (
        <div className="flex flex-col gap-xs">
          <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
            {copy.awaitingHint}
          </p>
          <a
            href={state.deepLink}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-label uppercase tracking-[0.08em] text-text-display underline underline-offset-2 hover:opacity-80"
          >
            {copy.reopen} →
          </a>
        </div>
      )}

      {state.kind === "error" && (
        <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
          {state.message}
        </p>
      )}
    </div>
  );
}

function mapError(
  code: string | undefined,
  copy: TelegramButtonCopy
): string {
  switch (code) {
    case "telegram_not_configured":
      return copy.notConfigured;
    case "invite_required":
      return copy.inviteRequired;
    case "invite_invalid":
      return copy.inviteInvalid;
    case "invite_consumed":
      return copy.inviteConsumed;
    case "telegram_id_taken":
      return copy.telegramIdTaken;
    case "nonce_expired":
      return copy.expired;
    case "nonce_consumed":
      return copy.consumed;
    case "rate_limited":
      return copy.rateLimited;
    default:
      return copy.generic;
  }
}
