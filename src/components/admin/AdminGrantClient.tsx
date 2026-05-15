"use client";

import { useState } from "react";

type GrantUser = {
  email: string;
  emailVerified: boolean;
  accessStatus: string;
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
  subscription_url_required: "Subscription/config URL is required.",
  kv_not_configured: "Account storage is not configured.",
  auth_secret_not_configured: "AUTH_SECRET is not configured.",
  invalid_json: "Invalid request body.",
  grant_failed: "Grant failed. Check server logs.",
};

export function AdminGrantClient() {
  const [secret, setSecret] = useState("");
  const [email, setEmail] = useState("");
  const [subscriptionUrl, setSubscriptionUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<GrantResult>({ kind: "idle" });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;

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
          email,
          subscriptionUrl,
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

  return (
    <main className="min-h-screen bg-black text-text-primary pt-[120px] pb-3xl">
      <div className="max-w-2xl mx-auto px-lg flex flex-col gap-2xl">
        <header className="flex flex-col gap-md">
          <p className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
            PRSLOY ADMIN
          </p>
          <h1
            className="font-body font-bold text-text-display leading-[0.98]"
            style={{ fontSize: "clamp(36px, 7vw, 72px)" }}
          >
            Manual VPN grant
          </h1>
          <p className="font-body text-body text-text-secondary leading-[1.65]">
            Paste the account email and the real subscription/config URL from the VPN panel. This
            page only attaches an existing VPN key to the site account.
          </p>
        </header>

        <form
          onSubmit={onSubmit}
          className="border border-border-visible rounded-[24px] p-xl sm:p-2xl bg-surface flex flex-col gap-lg"
        >
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
                       transition-all duration-150 ease-out-nothing"
          >
            [ {pending ? "Granting..." : "Grant access"} ]
          </button>

          {result.kind === "error" && (
            <p role="alert" className="font-body text-body-sm text-accent leading-[1.55]">
              {result.message}
            </p>
          )}

          {result.kind === "success" && (
            <section className="border border-border-visible rounded-[16px] p-lg flex flex-col gap-sm">
              <p className="font-mono text-label uppercase tracking-[0.12em] text-success">
                Access granted
              </p>
              <p className="font-body text-body-sm text-text-secondary break-words">
                {result.user.email}
              </p>
              <a
                href={result.user.subscriptionUrl || "#"}
                className="font-mono text-body-sm text-text-display break-all hover:opacity-80"
              >
                {result.user.subscriptionUrl}
              </a>
            </section>
          )}
        </form>
      </div>
    </main>
  );
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
