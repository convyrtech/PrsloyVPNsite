"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { DottedSnakeBorder } from "@/components/ui/DottedSnakeBorder";

type Outcome = "success" | "failed";
type Phase = "processing" | "confirmed" | "failed";

export function PaymentResultBanner() {
  const t = useTranslations("payment_result");
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const raw = searchParams.get("payment");
    if (raw !== "success" && raw !== "failed") return;
    setOutcome(raw);
    // Strip the query so a hard refresh does not re-trigger the banner.
    router.replace(pathname);
  }, [searchParams, router, pathname]);

  // On success, poll the order until it flips to confirmed, so the banner stops
  // saying "processing" the moment the Platega callback lands — instead of
  // contradicting the "active" status + key the page already shows below.
  const pollRef = useRef(0);
  useEffect(() => {
    if (outcome !== "success" || confirmed) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const MAX_POLLS = 20; // ~80s at 4s
    const INTERVAL_MS = 4000;

    async function tick() {
      try {
        const res = await fetch("/api/payments/me", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          order?: { status?: string; confirmedAt?: string | null } | null;
        };
        if (!alive) return;
        const o = data.order;
        if (o && (o.status === "confirmed" || o.confirmedAt)) {
          setConfirmed(true);
          return;
        }
      } catch {
        /* transient — keep polling within budget */
      }
      if (alive && pollRef.current < MAX_POLLS) {
        pollRef.current += 1;
        timer = setTimeout(tick, INTERVAL_MS);
      }
    }

    tick();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [outcome, confirmed]);

  if (!outcome || dismissed) return null;

  const phase: Phase =
    outcome === "failed" ? "failed" : confirmed ? "confirmed" : "processing";

  const title =
    phase === "failed"
      ? t("failed_title")
      : phase === "confirmed"
        ? t("confirmed_title")
        : t("success_title");
  const body =
    phase === "failed"
      ? t("failed_body")
      : phase === "confirmed"
        ? t("confirmed_body")
        : t("success_body");

  const isFailed = phase === "failed";
  const tone = isFailed
    ? "border-accent/60 bg-accent/[0.06]"
    : phase === "confirmed"
      ? "border-success/60 bg-success/[0.06]"
      : // Processing: the snake dots are the only frame — no solid border, no
        // filled panel, so the dotted wave reads cleanly against the page.
        "border-transparent bg-transparent";
  const dotTone = isFailed
    ? "bg-accent"
    : phase === "confirmed"
      ? "bg-success shadow-[0_0_12px_rgba(74,158,92,0.7)]"
      : "bg-success animate-pulse";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative flex items-start gap-md rounded-[8px] border p-lg ${tone}`}
    >
      {/* The snake runs only while we are still waiting on the callback. */}
      {phase === "processing" && <DottedSnakeBorder radius={8} />}

      <span
        aria-hidden="true"
        className={`mt-[6px] inline-block h-[8px] w-[8px] rounded-full ${dotTone}`}
      />
      <div className="flex flex-1 flex-col gap-xs">
        <span className="font-mono text-label uppercase tracking-[0.16em] text-text-display">
          {title}
        </span>
        <p className="font-body text-body-sm text-text-secondary leading-[1.55]">
          {body}
        </p>
      </div>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label={t("dismiss")}
        className="font-mono text-label uppercase tracking-[0.12em] text-text-display hover:opacity-80
                   px-sm py-xs"
      >
        ✕
      </button>
    </div>
  );
}
