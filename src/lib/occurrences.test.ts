import { describe, it, expect } from "vitest";
import { incomeOccurrences } from "./occurrences";
import type { IncomeSource } from "../types";

const src = (o: Partial<IncomeSource>): IncomeSource => ({
  id: "i1", name: "Pay", amount: 1000, frequency: "monthly", anchorDate: "2026-01-15", received: {}, ...o,
});

describe("incomeOccurrences", () => {
  it("monthly lands on the anchor day", () => {
    const o = incomeOccurrences(src({ frequency: "monthly", anchorDate: "2026-01-15" }), 2026, 6);
    expect(o).toHaveLength(1);
    expect(o[0].date).toBe("2026-07-15");
  });
  it("monthly clamps day 31 in short months", () => {
    const o = incomeOccurrences(src({ frequency: "monthly", anchorDate: "2026-01-31" }), 2026, 1);
    expect(o[0].date).toBe("2026-02-28");
  });
  it("biweekly steps 14 days across month boundaries", () => {
    // anchor Fri 2026-06-26 -> Jul 10, Jul 24
    const o = incomeOccurrences(src({ frequency: "biweekly", anchorDate: "2026-06-26" }), 2026, 6);
    expect(o.map((x) => x.date)).toEqual(["2026-07-10", "2026-07-24"]);
  });
  it("weekly yields 4-5 occurrences in a month", () => {
    const o = incomeOccurrences(src({ frequency: "weekly", anchorDate: "2026-07-03" }), 2026, 6);
    expect(o.map((x) => x.day)).toEqual([3, 10, 17, 24, 31]);
  });
  it("biweekly before the anchor yields nothing", () => {
    const o = incomeOccurrences(src({ frequency: "biweekly", anchorDate: "2026-08-07" }), 2026, 6);
    expect(o).toHaveLength(0);
  });
  it("quarterly only fires every third month from anchor", () => {
    const s = src({ frequency: "quarterly", anchorDate: "2026-01-10" });
    expect(incomeOccurrences(s, 2026, 3)).toHaveLength(1); // April
    expect(incomeOccurrences(s, 2026, 4)).toHaveLength(0); // May
    expect(incomeOccurrences(s, 2026, 6)).toHaveLength(1); // July
  });
  it("annual fires on the anniversary month only", () => {
    const s = src({ frequency: "annual", anchorDate: "2025-07-04" });
    expect(incomeOccurrences(s, 2026, 6)[0]?.date).toBe("2026-07-04");
    expect(incomeOccurrences(s, 2026, 7)).toHaveLength(0);
  });
  it("one-time fires only in its own month", () => {
    const s = src({ frequency: "once", anchorDate: "2026-07-20" });
    expect(incomeOccurrences(s, 2026, 6)).toHaveLength(1);
    expect(incomeOccurrences(s, 2026, 7)).toHaveLength(0);
  });
});
