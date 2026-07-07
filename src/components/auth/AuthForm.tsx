"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { isValidEmail } from "@/lib/validation";
import { readUtmSource } from "@/lib/client-utm";
import { getForcedError } from "@/lib/dev-state";

type AuthCopy = {
  email: string;
  password: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  submit: string;
  submitting: string;
  invalid: string;
  emailExists: string;
  credentials: string;
  notConfigured: string;
  storageNotConfigured: string;
  secretNotConfigured: string;
  rateLimited: string;
  generic: string;
  inviteLabel?: string;
  invitePlaceholder?: string;
  inviteRequired?: string;
  inviteInvalid?: string;
  inviteConsumed?: string;
};

type AuthFormProps = {
  mode: "login" | "register";
  locale: string;
  copy: AuthCopy;
};

// Outer wrapper adds the Suspense boundary required by useSearchParams.
// /register and /login render this; the form interior reads ?code= for
// the invite-prefill flow coming from the email magic-link.
export function AuthForm(props: AuthFormProps) {
  return (
    <Suspense fallback={<AuthFormInner {...props} initialInviteCode="" />}>
      <AuthFormWithSearchParams {...props} />
    </Suspense>
  );
}

function AuthFormWithSearchParams(props: AuthFormProps) {
  const params = useSearchParams();
  const initialInviteCode = params.get("code")?.trim() ?? "";
  return <AuthFormInner {...props} initialInviteCode={initialInviteCode} />;
}

function AuthFormInner({
  mode,
  locale,
  copy,
  initialInviteCode,
}: AuthFormProps & { initialInviteCode: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  // If user navigates between /login and /register with a magic-link
  // already in the URL, sync the field state when the param changes.
  useEffect(() => {
    if (initialInviteCode) setInviteCode(initialInviteCode);
  }, [initialInviteCode]);

  // Dev-only: ?__error=<code> renders any error message for a visual check
  // without a backend round-trip. Inert in production (getForcedError → null).
  useEffect(() => {
    const fe = getForcedError();
    if (!fe) return;
    const map: Record<string, string | undefined> = {
      email_exists: copy.emailExists,
      invalid_credentials: copy.credentials,
      invalid_email: copy.invalid,
      invalid_password: copy.invalid,
      invite_required: copy.inviteRequired,
      invite_invalid: copy.inviteInvalid,
      invite_consumed: copy.inviteConsumed,
      kv_not_configured: copy.storageNotConfigured,
      auth_secret_not_configured: copy.secretNotConfigured,
      auth_not_configured: copy.notConfigured,
      rate_limited: copy.rateLimited,
    };
    setError(map[fe] ?? copy.generic);
  }, [copy]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    // Pre-validate client-side so obvious mistakes surface instantly
    // instead of after a network round-trip.
    const trimmedEmail = email.trim();
    if (!isValidEmail(trimmedEmail)) {
      setError(copy.invalid);
      return;
    }
    if (mode === "register" && password.length < 8) {
      setError(copy.invalid);
      return;
    }
    if (mode === "register" && !inviteCode.trim()) {
      setError(copy.inviteRequired ?? copy.invalid);
      return;
    }

    setPending(true);
    setError("");

    try {
      const utmSource = mode === "register" ? readUtmSource() : undefined;
      const body: Record<string, string> = {
        email: trimmedEmail,
        password,
        locale,
      };
      if (mode === "register") body.inviteCode = inviteCode.trim();
      if (utmSource) body.utmSource = utmSource;

      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        if (data.error === "email_exists") setError(copy.emailExists);
        else if (data.error === "invalid_credentials") setError(copy.credentials);
        else if (data.error === "invalid_email" || data.error === "invalid_password") setError(copy.invalid);
        else if (data.error === "invite_required") setError(copy.inviteRequired ?? copy.generic);
        else if (data.error === "invite_invalid") setError(copy.inviteInvalid ?? copy.generic);
        else if (data.error === "invite_consumed") setError(copy.inviteConsumed ?? copy.generic);
        else if (data.error === "kv_not_configured") setError(copy.storageNotConfigured);
        else if (data.error === "auth_secret_not_configured") setError(copy.secretNotConfigured);
        else if (data.error === "auth_not_configured") setError(copy.notConfigured);
        else if (data.error === "rate_limited") setError(copy.rateLimited);
        else setError(copy.generic);
        return;
      }

      router.push(`/${locale}/dashboard${mode === "register" ? "?registered=1" : ""}`);
      router.refresh();
    } catch {
      setError(copy.generic);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-md" noValidate>
      <label className="flex flex-col gap-xs">
        <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
          {copy.email}
        </span>
        <input
          type="email"
          autoComplete="email"
          required
          placeholder={copy.emailPlaceholder}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-surface border border-border-visible rounded-full px-lg min-h-[48px]
                     font-mono text-body text-text-display placeholder:text-text-disabled
                     focus:outline-none focus:border-text-display transition-colors"
        />
      </label>

      <label className="flex flex-col gap-xs">
        <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
          {copy.password}
        </span>
        <input
          type="password"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
          minLength={8}
          placeholder={copy.passwordPlaceholder}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-surface border border-border-visible rounded-full px-lg min-h-[48px]
                     font-mono text-body text-text-display placeholder:text-text-disabled
                     focus:outline-none focus:border-text-display transition-colors"
        />
      </label>

      {mode === "register" && copy.inviteLabel && (
        <label className="flex flex-col gap-xs">
          <span className="font-mono text-label uppercase tracking-[0.12em] text-text-disabled">
            {copy.inviteLabel}
          </span>
          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            required
            placeholder={copy.invitePlaceholder ?? ""}
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className="bg-surface border border-border-visible rounded-full px-lg min-h-[48px]
                       font-mono text-body text-text-display placeholder:text-text-disabled
                       focus:outline-none focus:border-text-display transition-colors uppercase"
          />
        </label>
      )}

      <button
        type="submit"
        disabled={pending}
        className="mt-md bg-text-display text-black font-mono uppercase tracking-[0.08em]
                   px-xl min-h-[48px] inline-flex items-center justify-center rounded-full text-label
                   hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait
                   transition duration-150 ease-out-nothing"
      >
        [ {pending ? copy.submitting : copy.submit} ]
      </button>

      {error && (
        <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
          {error}
        </p>
      )}
    </form>
  );
}
