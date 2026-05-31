"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import type { PaymentOrder, PaymentStatus } from "@/lib/payments";
import { MONTHS_BY_PERIOD, type Period } from "@/lib/pricing";

type State =
  | { kind: "loading" }
  | { kind: "ready"; order: PaymentOrder | null }
  | { kind: "error" };

type Copy = {
  label: string;
  emptyTitle: string;
  emptyBody: string;
  pay: string;
  renew: string;
  loading: string;
  error: string;
  perMonth: string;
  perPeriod: (months: number) => string;
  activeUntil: string;
  expired: string;
  statuses: Record<PaymentStatus, string>;
};

const COPY: Record<"ru" | "en", Copy> = {
  ru: {
    label: "SUBSCRIPTION",
    emptyTitle: "Подписки пока нет",
    emptyBody: "Когда оплатишь, статус подписки появится здесь.",
    pay: "Оплатить",
    renew: "Продлить",
    loading: "Проверяем подписку...",
    error: "Не получилось загрузить статус подписки.",
    perMonth: "за мес",
    perPeriod: (m) => `за ${m} мес`,
    activeUntil: "Действует до",
    expired: "истекла",
    statuses: {
      created: "создан",
      pending: "ожидает оплаты",
      confirmed: "активна",
      canceled: "отменена",
      chargebacked: "возврат / спор",
      failed: "не прошла",
    },
  },
  en: {
    label: "SUBSCRIPTION",
    emptyTitle: "No subscription yet",
    emptyBody: "Once you pay, the subscription status appears here.",
    pay: "Pay",
    renew: "Renew",
    loading: "Checking subscription...",
    error: "Could not load subscription status.",
    perMonth: "per month",
    perPeriod: (m) => `for ${m} months`,
    activeUntil: "Active until",
    expired: "expired",
    statuses: {
      created: "created",
      pending: "pending",
      confirmed: "active",
      canceled: "canceled",
      chargebacked: "chargeback",
      failed: "failed",
    },
  },
};

export function PaymentStatusCard({ locale }: { locale: string }) {
  const copy = locale === "en" ? COPY.en : COPY.ru;
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let polls = 0;
    // The Platega callback that flips an order pending -> confirmed is async
    // and lands seconds after the browser returns to /dashboard. Poll a few
    // times so the strip auto-advances to "активна" without a manual reload,
    // then stop once the order reaches a terminal state (or the budget runs out).
    const MAX_POLLS = 15; // ~60s at 4s
    const INTERVAL_MS = 4000;

    function scheduleNext(order: PaymentOrder | null) {
      const awaiting =
        !!order && (order.status === "pending" || order.status === "created");
      if (alive && awaiting && polls < MAX_POLLS) {
        polls += 1;
        timer = setTimeout(fetchOrder, INTERVAL_MS);
      }
    }

    async function fetchOrder() {
      try {
        const res = await fetch("/api/payments/me", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          order?: PaymentOrder | null;
        };
        if (!alive) return;
        if (res.ok && data.ok) {
          const order = data.order ?? null;
          setState({ kind: "ready", order });
          scheduleNext(order);
        } else {
          setState((prev) => (prev.kind === "loading" ? { kind: "error" } : prev));
        }
      } catch {
        // On refetch we keep whatever data we already have; only the initial
        // load downgrades to "error". Keep polling within budget so a confirmed
        // payment still surfaces after a transient network blip.
        if (!alive) return;
        setState((prev) => (prev.kind === "loading" ? { kind: "error" } : prev));
        if (polls < MAX_POLLS) {
          polls += 1;
          timer = setTimeout(fetchOrder, INTERVAL_MS);
        }
      }
    }

    function onVisible() {
      if (document.visibilityState !== "visible") return;
      // Returning to the tab restarts a fresh poll budget.
      if (timer) clearTimeout(timer);
      polls = 0;
      fetchOrder();
    }

    fetchOrder();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <Strip label={copy.label}>
        <span className="font-mono text-label uppercase tracking-[0.1em] text-text-disabled">
          {copy.loading}
        </span>
      </Strip>
    );
  }

  if (state.kind === "error") {
    return (
      <Strip label={copy.label}>
        <span className="font-mono text-label uppercase tracking-[0.1em] text-accent">
          {copy.error}
        </span>
      </Strip>
    );
  }

  if (!state.order) {
    return (
      <Strip label={copy.label}>
        <span className="font-mono text-label uppercase tracking-[0.1em] text-text-secondary">
          {copy.emptyTitle}
        </span>
        <Link
          href="/pricing"
          className="inline-flex items-center min-h-[44px]
                     font-mono text-label uppercase tracking-[0.08em]
                     text-text-display hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          {copy.pay} {"→"}
        </Link>
      </Strip>
    );
  }

  const order = state.order;
  // An order that never confirmed (no money landed) is not a subscription —
  // a 'canceled subscription' line next to an admin-granted active key is
  // misleading. Hide the strip; treat it as 'no subscription yet'.
  if (order.confirmedAt === null && order.status !== "pending" && order.status !== "created") {
    return null;
  }
  const isConfirmed = order.status === "confirmed";
  // If a paid order has run past its period, reframe as 'expired' rather
  // than 'canceled' so the user does not see contradictory copy.
  const isExpired = !isConfirmed && hasPeriodElapsed(order.confirmedAt, order.period as Period);
  const isActionable = !isConfirmed; // pending / failed / expired all get a Pay/Renew CTA
  const periodText =
    order.period === "1mo"
      ? copy.perMonth
      : copy.perPeriod(MONTHS_BY_PERIOD[order.period as Period] ?? 1);
  const activeUntil = isConfirmed
    ? computeActiveUntil(order.confirmedAt, order.period as Period, locale)
    : null;
  const statusLabel = isExpired ? copy.expired : copy.statuses[order.status];

  return (
    <Strip label={copy.label}>
      <span className="font-mono text-label uppercase tracking-[0.1em] text-text-display">
        {statusLabel} · {order.amountRub} ₽ {periodText}
        {activeUntil && (
          <span className="text-text-disabled">
            {" "} · {copy.activeUntil} {activeUntil}
          </span>
        )}
      </span>
      {isActionable && (
        <Link
          href="/pricing"
          className="inline-flex items-center min-h-[44px]
                     font-mono text-label uppercase tracking-[0.08em]
                     text-text-display hover:opacity-80 transition-opacity whitespace-nowrap"
        >
          {isExpired ? copy.renew : copy.pay} {"→"}
        </Link>
      )}
    </Strip>
  );
}

function hasPeriodElapsed(confirmedAt: string | null, period: Period): boolean {
  if (!confirmedAt) return false;
  const start = new Date(confirmedAt);
  if (Number.isNaN(start.getTime())) return false;
  const end = new Date(start);
  end.setMonth(end.getMonth() + (MONTHS_BY_PERIOD[period] ?? 1));
  return end.getTime() < Date.now();
}

// Strip layout — separator label + horizontal content row + optional CTA.
// No card border; spacing handles the section break.
function Strip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-md">
      <div className="flex items-center gap-md font-mono text-label uppercase tracking-[0.16em]">
        <span className="text-text-display">{label}</span>
        <span className="flex-1 h-px bg-border-visible/40" />
      </div>
      <div className="flex items-center justify-between gap-md flex-wrap">
        {children}
      </div>
    </section>
  );
}

// One-shot SBP payments — there is no recurring billing. We just show the end
// of the paid period (confirmedAt + N months) so the user knows when access
// stops, not when "the next charge" happens.
function computeActiveUntil(
  confirmedAt: string | null,
  period: Period,
  locale: string
): string | null {
  if (!confirmedAt) return null;
  const start = new Date(confirmedAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setMonth(end.getMonth() + (MONTHS_BY_PERIOD[period] ?? 1));
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(end);
}
