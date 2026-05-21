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
