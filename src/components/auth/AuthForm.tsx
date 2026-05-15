"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  generic: string;
};

type AuthFormProps = {
  mode: "login" | "register";
  locale: string;
  copy: AuthCopy;
};

export function AuthForm({ mode, locale, copy }: AuthFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

    setPending(true);
    setError("");

    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        if (data.error === "email_exists") setError(copy.emailExists);
        else if (data.error === "invalid_credentials") setError(copy.credentials);
        else if (data.error === "invalid_email" || data.error === "invalid_password") setError(copy.invalid);
        else if (data.error === "kv_not_configured") setError(copy.storageNotConfigured);
        else if (data.error === "auth_secret_not_configured") setError(copy.secretNotConfigured);
        else if (data.error === "auth_not_configured") setError(copy.notConfigured);
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
                     font-mono text-body-sm text-text-display placeholder:text-text-disabled
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
                     font-mono text-body-sm text-text-display placeholder:text-text-disabled
                     focus:outline-none focus:border-text-display transition-colors"
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-md bg-text-display text-black font-mono uppercase tracking-[0.08em]
                   px-xl min-h-[48px] inline-flex items-center justify-center rounded-full text-label
                   hover:opacity-90 active:scale-[0.98] disabled:opacity-60 disabled:cursor-wait
                   transition-all duration-150 ease-out-nothing"
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
