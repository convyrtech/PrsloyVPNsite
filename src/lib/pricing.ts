export type Period = "1mo" | "6mo" | "1yr";
export type Payment = "SBP" | "CARD" | "BTC" | "ETH" | "TON" | "USDT";

export const PERIODS: readonly Period[] = ["1mo", "6mo", "1yr"];
export const FIAT_PAYMENTS: readonly Payment[] = ["SBP", "CARD"];
export const CRYPTO_PAYMENTS: readonly Payment[] = ["BTC", "ETH", "TON", "USDT"];

export const PRICE_BY_PERIOD: Record<Period, number> = {
  "1mo": 5,
  "6mo": 4,
  "1yr": 3,
};

export const MONTHS_BY_PERIOD: Record<Period, number> = {
  "1mo": 1,
  "6mo": 6,
  "1yr": 12,
};

export const RUB_PER_USD = 90;

export function getPeriodTotalUsd(period: Period): number {
  return PRICE_BY_PERIOD[period] * MONTHS_BY_PERIOD[period];
}

export function getPeriodTotalRub(period: Period): number {
  return Math.round(getPeriodTotalUsd(period) * RUB_PER_USD);
}

// Per-month price in rubles — what the SBP charge works out to monthly.
export function getMonthlyPriceRub(period: Period): number {
  return Math.round(PRICE_BY_PERIOD[period] * RUB_PER_USD);
}

// Displayed monthly price by locale. RU audiences pay (and think) in rubles —
// the SBP charge is already RUB at this rate — so RU shows ₽, EN shows $.
export function formatMonthlyPrice(period: Period, locale: string): string {
  return locale === "en"
    ? `$${PRICE_BY_PERIOD[period]}`
    : `${getMonthlyPriceRub(period)} ₽`;
}

// Displayed period total by locale (used on the 6-/12-month "итого" line).
export function formatPeriodTotal(period: Period, locale: string): string {
  return locale === "en"
    ? `$${getPeriodTotalUsd(period)}`
    : `${getPeriodTotalRub(period)} ₽`;
}

export type PaymentRate = {
  mult: number;
  precision: number;
  unit: string;
  prefix: boolean;
};

export const PAYMENT_RATES: Record<Payment, PaymentRate> = {
  SBP:  { mult: 90,      precision: 0, unit: "₽",    prefix: true  },
  CARD: { mult: 1,       precision: 0, unit: "$",    prefix: true  },
  BTC:  { mult: 0.00017, precision: 5, unit: "BTC",  prefix: false },
  ETH:  { mult: 0.0021,  precision: 4, unit: "ETH",  prefix: false },
  TON:  { mult: 1.85,    precision: 2, unit: "TON",  prefix: false },
  USDT: { mult: 1,       precision: 2, unit: "USDT", prefix: false },
};

export function formatConversion(period: Period, payment: Payment): string {
  const rate = PAYMENT_RATES[payment];
  const amount = (PRICE_BY_PERIOD[period] * rate.mult).toFixed(rate.precision);
  return rate.prefix ? `≈ ${rate.unit}${amount}` : `≈ ${amount} ${rate.unit}`;
}
