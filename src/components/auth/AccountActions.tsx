"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LogoutButton({ label, locale }: { label: string; locale: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function logout() {
    if (pending) return;
    setPending(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    router.push(`/${locale}/login`);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={pending}
      className="inline-flex items-center min-h-[44px] font-mono text-label uppercase
                 tracking-[0.08em] text-text-display hover:opacity-80 disabled:opacity-50"
    >
      {label}
    </button>
  );
}

export function ResendVerificationButton({
  label,
  sentLabel,
  errorLabel,
  locale,
}: {
  label: string;
  sentLabel: string;
  errorLabel: string;
  locale: string;
}) {
  const [state, setState] = useState<"idle" | "pending" | "sent" | "error">("idle");

  async function resend() {
    if (state === "pending") return;
    setState("pending");
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
      setState(res.ok && data.ok ? "sent" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <div className="flex flex-col gap-xs">
      <button
        type="button"
        onClick={resend}
        disabled={state === "pending"}
        className="self-start inline-flex items-center min-h-[44px] font-mono text-label uppercase
                   tracking-[0.08em] text-text-display hover:opacity-80 disabled:opacity-50"
      >
        {state === "sent" ? sentLabel : label}
      </button>
      {state === "error" && (
        <span className="font-body text-body-sm text-accent">{errorLabel}</span>
      )}
    </div>
  );
}
