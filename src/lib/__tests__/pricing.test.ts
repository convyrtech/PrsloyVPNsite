import { describe, expect, it } from "vitest";
import {
  PERIODS,
  PRICE_RUB_BY_PERIOD,
  MONTHS_BY_PERIOD,
  getMonthlyPriceRub,
  getPeriodTotalRub,
  formatPeriodTotal,
} from "@/lib/pricing";

// The invariant the checkout depends on: the ruble figure shown on the pay
// buttons and the "итого" line IS the figure charged (payments.ts copies
// getPeriodTotalRub into order.amountRub, platega.ts sends amountRub as-is).
describe("pricing", () => {
  it("quotes the published ruble prices", () => {
    expect(PRICE_RUB_BY_PERIOD).toEqual({ "1mo": 199, "6mo": 159, "1yr": 119 });
    expect(getPeriodTotalRub("1mo")).toBe(199);
    expect(getPeriodTotalRub("6mo")).toBe(954);
    expect(getPeriodTotalRub("1yr")).toBe(1428);
  });

  it("keeps the displayed total equal to the charged total", () => {
    for (const period of PERIODS) {
      expect(formatPeriodTotal(period)).toBe(`${getPeriodTotalRub(period)} ₽`);
      expect(getPeriodTotalRub(period)).toBe(
        getMonthlyPriceRub(period) * MONTHS_BY_PERIOD[period]
      );
    }
  });

  it("keeps every period price at three digits so the price layout is stable", () => {
    for (const period of PERIODS) {
      expect(String(getMonthlyPriceRub(period))).toHaveLength(3);
    }
  });
});
