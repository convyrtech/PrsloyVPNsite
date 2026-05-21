"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import type { PaymentOrder, PaymentStatus } from "@/lib/payments";

type State =
  | { kind: "loading" }
  | { kind: "ready"; order: PaymentOrder | null }
  | { kind: "error" };

type Copy = {
  label: string;
  emptyTitle: string;
  emptyBody: string;
  pay: string;
  loading: string;
  error: string;
  amount: string;
  period: string;
  statuses: Record<PaymentStatus, string>;
};

const COPY: Record<"ru" | "en", Copy> = {
  ru: {
    label: "Оплата",
    emptyTitle: "Заказов пока нет",
    emptyBody: "Когда оплатишь подписку, статус появится здесь.",
    pay: "Оплатить",
    loading: "Проверяем оплату...",
    error: "Не получилось загрузить оплату.",
    amount: "Сумма",
    period: "Период",
    statuses: {
      created: "создан",
      pending: "ожидает оплаты",
      confirmed: "оплачено",
      canceled: "отменено",
      chargebacked: "возврат/спор",
      failed: "не прошло",
    },
  },
  en: {
    label: "Payment",
    emptyTitle: "No orders yet",
    emptyBody: "Once you pay for a subscription, the payment status appears here.",
    pay: "Pay",
    loading: "Checking payment...",
    error: "Could not load payment status.",
    amount: "Amount",
    period: "Period",
    statuses: {
      created: "created",
      pending: "pending",
      confirmed: "paid",
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
    fetch("/api/payments/me", { cache: "no-store" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          order?: PaymentOrder | null;
        };
        if (!alive) return;
        setState(res.ok && data.ok ? { kind: "ready", order: data.order ?? null } : { kind: "error" });
      })
      .catch(() => {
        if (alive) setState({ kind: "error" });
      });
    return () => {
      alive = false;
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
          {copy.pay} {"\u2192"}
        </Link>
      </Shell>
    );
  }

  const order = state.order;
  const tone = order.status === "confirmed" ? "bg-success" : "bg-warning";

  return (
    <Shell label={copy.label}>
      <div className="flex items-center gap-sm">
        <span className={`h-[7px] w-[7px] rounded-full ${tone}`} />
        <span className="font-mono text-label uppercase tracking-[0.1em] text-text-display">
          {copy.statuses[order.status]}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-sm">
        <Metric label={copy.amount} value={`${order.amountRub} RUB`} />
        <Metric label={copy.period} value={order.period} />
      </div>
    </Shell>
  );
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border-visible bg-black p-md min-w-0">
      <span className="block font-mono text-label uppercase tracking-[0.1em] text-text-disabled">
        {label}
      </span>
      <span className="mt-xs block font-mono text-body-sm uppercase tracking-[0.02em] text-text-display truncate">
        {value}
      </span>
    </div>
  );
}
