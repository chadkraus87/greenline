import { describe, it, expect } from "vitest";
import { computeMonth } from "./forecast";
import { incomeOccurrences } from "./occurrences";
import { money, num, sanitize } from "./money";
import type { AppData, IncomeSource } from "../types";

const empty = (): AppData => ({
  settings: { theme: "dark", clock24: false, startBalance: 0, bufferFloor: 0, extraDebtBudget: 0, emergencyMonths: 3, rolloverBudgets: false },
  categories: [], incomes: [], bills: [], expenses: [], goals: [], events: [], sinkingFunds: [], debts: [],
});

describe("reviewer edge cases", () => {
  it("empty database: forecast is flat, health 100, no crashes", () => {
    const m = computeMonth(empty(), 2026, 6, new Date(2026, 6, 20));
    expect(m.projectedEnd).toBe(0); expect(m.health).toBe(100); expect(m.firstDip).toBeNull();
  });
  it("bill dueDay 31 clamps in Feb and non-leap years", () => {
    const d = empty();
    d.bills = [{ id: "b", name: "X", amount: 10, categoryId: "c", dueDay: 31, priority: "normal", paid: {} }];
    const feb = computeMonth(d, 2027, 1, new Date(2027, 1, 1));
    expect(feb.billOccs[0].day).toBe(28);
  });
  it("Dec -> Jan biweekly rollover across year boundary", () => {
    const inc: IncomeSource = { id: "i", name: "P", amount: 1, frequency: "biweekly", anchorDate: "2026-12-25", received: {} };
    expect(incomeOccurrences(inc, 2027, 0).map(o => o.date)).toEqual(["2027-01-08", "2027-01-22"]);
  });
  it("floating point: 0.1+0.2 style sums stay 2dp", () => {
    const d = empty();
    d.expenses = [
      { id: "1", title: "a", amount: 0.1, categoryId: "c", date: "2026-07-01" },
      { id: "2", title: "b", amount: 0.2, categoryId: "c", date: "2026-07-02" },
    ];
    const m = computeMonth(d, 2026, 6, new Date(2026, 6, 20));
    expect(m.expensesTotal).toBe(0.3);
    expect(m.forecast[1].balance).toBe(-0.3);
  });
  it("money() formats negatives and large values", () => {
    expect(money(-5)).toBe("\u2212$5.00");
    expect(money(12345.67)).toBe("$12,346");
    expect(money(5, true)).toBe("+$5.00");
  });
  it("num() rejects NaN/negative/Infinity", () => {
    expect(num("abc")).toBe(0); expect(num(-3)).toBe(0); expect(num(Infinity)).toBe(0); expect(num("2.999")).toBe(3);
  });
  it("sanitize strips angle brackets and caps length", () => {
    expect(sanitize("<script>alert(1)</script>")).toBe("scriptalert(1)/script");
    expect(sanitize("x".repeat(999)).length).toBe(120);
  });
  it("health never goes below 0 with many overdue bills", () => {
    const d = empty();
    d.bills = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, name: "X", amount: 1, categoryId: "c", dueDay: 1, priority: "normal" as const, paid: {} }));
    const m = computeMonth(d, 2026, 6, new Date(2026, 6, 20));
    expect(m.health).toBe(0);
  });
});
