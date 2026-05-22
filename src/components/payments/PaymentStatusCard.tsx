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
    label: "Подписка",
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
    label: "Subscription",
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

    async function fetchOrder() {
      try {
        const res = await fetch("/api/payments/me", { cache: "no-store" });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          order?: PaymentOrder | null;
        };
        if (!alive) return;
        setState(
          res.ok && data.ok
            ? { kind: "ready", order: data.order ?? null }
            : { kind: "error" }
        );
      } catch {
        // On refetch we keep whatever data we already have; only the
        // initial load downgrades to "error".
        if (!alive) return;
        setState((prev) => (prev.kind === "loading" ? { kind: "error" } : prev));
      }
    }

    function onVisible() {
      if (document.visibilityState === "visible") fetchOrder();
    }

    fetchOrder();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <Shell label={copy.label}>
        <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
          {copy.loading}
        </p>
      </Shell>
    );
  }

  if (state.kind === "error") {
    return (
      <Shell label={copy.label}>
        <p className="font-body text-body-sm text-accent leading-[1.6]">{copy.error}</p>
      </Shell>
    );
  }

  if (!state.order) {
    return (
      <Shell label={copy.label}>
        <h2 className="font-body font-bold text-text-display text-subheading leading-[1.15]">
          {copy.emptyTitle}
        </h2>
        <p className="font-body text-body-sm text-text-secondary leading-[1.6]">
          {copy.emptyBody}
        </p>
        <Link
          href="/pricing"
          className="self-start font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80 transition-opacity"
        >
          {copy.pay} {"→"}
        </Link>
      </Shell>
    );
  }

  const order = state.order;
  const isConfirmed = order.status === "confirmed";
  // If a paid order has run past its period, reframe as 'expired' rather
  // than 'canceled' — otherwise a user whose key still works sees
  // contradictory copy ('access active' next to 'subscription canceled').
  const isExpired = !isConfirmed && hasPeriodElapsed(order.confirmedAt, order.period as Period);
  const tone = isConfirmed
    ? "bg-success shadow-[0_0_10px_rgba(74,158,92,0.7)]"
    : "bg-warning";
  const periodText =
    order.period === "1mo"
      ? copy.perMonth
      : copy.perPeriod(MONTHS_BY_PERIOD[order.period as Period] ?? 1);
  const activeUntil = isConfirmed
    ? computeActiveUntil(order.confirmedAt, order.period as Period, locale)
    : null;
  const statusLabel = isExpired ? copy.expired : copy.statuses[order.status];

  return (
    <Shell label={copy.label}>
      <div className="flex items-center gap-sm flex-wrap">
        <span className={`h-[7px] w-[7px] rounded-full ${tone}`} />
        <span className="font-mono text-label uppercase tracking-[0.1em] text-text-display">
          {statusLabel} · {order.amountRub} ₽ {periodText}
        </span>
      </div>
      {activeUntil && (
        <p className="font-mono text-label uppercase tracking-[0.08em] text-text-disabled">
          {copy.activeUntil}: {activeUntil}
        </p>
      )}
      {isExpired && (
        <Link
          href="/pricing"
          className="inline-flex items-center min-h-[44px] self-start
                     font-mono text-label uppercase tracking-[0.08em] text-text-display hover:opacity-80 transition-opacity"
        >
          {copy.renew} {"→"}
        </Link>
      )}
    </Shell>
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

function Shell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border border-border-visible rounded-[8px] p-lg flex flex-col gap-md">
      <span className="font-mono text-label uppercase tracking-[0.16em] text-text-disabled">
        {label}
      </span>
      {children}
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
