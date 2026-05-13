"use client";

import { type Payment, FIAT_PAYMENTS, CRYPTO_PAYMENTS } from "@/lib/pricing";

export function PaymentPills({
  value,
  onChange,
}: {
  value: Payment;
  onChange: (v: Payment) => void;
}) {
  return (
    <div className="flex items-center gap-md flex-wrap justify-center">
      <div className="flex gap-sm">
        {FIAT_PAYMENTS.map((m) => (
          <Pill key={m} method={m} active={value === m} onClick={() => onChange(m)} />
        ))}
      </div>
      <div className="hidden sm:block w-px h-5 bg-border-visible" aria-hidden="true" />
      <div className="flex gap-sm flex-wrap justify-center">
        {CRYPTO_PAYMENTS.map((m) => (
          <Pill key={m} method={m} active={value === m} onClick={() => onChange(m)} />
        ))}
      </div>
    </div>
  );
}

function Pill({
  method,
  active,
  onClick,
}: {
  method: Payment;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        relative px-md min-h-[44px] inline-flex items-center justify-center
        font-mono text-label uppercase tracking-[0.08em]
        rounded-full border
        transition-colors duration-150 ease-out-nothing
        ${active
          ? "bg-text-display text-black border-text-display"
          : "border-border-visible text-text-secondary hover:text-text-primary hover:border-text-secondary"}
      `}
    >
      {method}
    </button>
  );
}
