export type Period = "1mo" | "6mo" | "1yr";

export const PERIODS: readonly Period[] = ["1mo", "6mo", "1yr"];

// Prices are ruble-first: the site quotes rubles and SBP charges rubles.
// Per-month price by period — longer periods buy the same month cheaper.
export const PRICE_RUB_BY_PERIOD: Record<Period, number> = {
  "1mo": 199,
  "6mo": 159,
  "1yr": 119,
};

export const MONTHS_BY_PERIOD: Record<Period, number> = {
  "1mo": 1,
  "6mo": 6,
  "1yr": 12,
};

// Internal estimate only (order bookkeeping) — never shown to the buyer.
const RUB_PER_USD = 90;

export function getMonthlyPriceRub(period: Period): number {
  return PRICE_RUB_BY_PERIOD[period];
}

export function getPeriodTotalRub(period: Period): number {
  return PRICE_RUB_BY_PERIOD[period] * MONTHS_BY_PERIOD[period];
}

export function getPeriodTotalUsd(period: Period): number {
  return Math.round((getPeriodTotalRub(period) / RUB_PER_USD) * 100) / 100;
}

// Displayed period total (the 6-/12-month "итого" line). Rubles in every
// locale: the charge is rubles, and the shown price must match the debit.
export function formatPeriodTotal(period: Period): string {
  return `${getPeriodTotalRub(period)} ₽`;
}
