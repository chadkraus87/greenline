import { describe, it, expect } from "vitest";
import { deductibleAmount, taxSummary, seTaxEstimate, quarterlyDueDates, mileageCsvRows, SCHEDULE_C } from "./tax";
import type { AppData, Expense } from "../types";

const base = (over: Partial<AppData> = {}): AppData => ({
  settings: {
    theme: "dark", clock24: false, startBalance: 0, bufferFloor: 0, extraDebtBudget: 0,
    emergencyMonths: 3, rolloverBudgets: false, businessMode: true, mileageRate: 0.7,
  },
  categories: [], incomes: [], bills: [], expenses: [], goals: [], events: [],
  sinkingFunds: [], debts: [], mileage: [],
  ...over,
});

const exp = (o: Partial<Expense>): Expense => ({
  id: "x", title: "t", amount: 100, categoryId: "c", date: "2026-03-01", ...o,
});

describe("deductibleAmount", () => {
  it("is zero for personal spending", () => {
    expect(deductibleAmount(exp({ business: false, amount: 100 }))).toBe(0);
  });
  it("is the full amount for a normal 100%-business expense", () => {
    expect(deductibleAmount(exp({ business: true, taxCategory: "supplies", amount: 100 }))).toBe(100);
  });
  it("halves business meals", () => {
    expect(deductibleAmount(exp({ business: true, taxCategory: "meals", amount: 100 }))).toBe(50);
  });
  it("applies business-use percentage to mixed costs", () => {
    expect(deductibleAmount(exp({ business: true, taxCategory: "utilities", amount: 100, businessPct: 60 }))).toBe(60);
  });
  it("compounds business-use % with the line's own limit", () => {
    // $100 meal at 50% business use → 50% of that is deductible → $25
    expect(deductibleAmount(exp({ business: true, taxCategory: "meals", amount: 100, businessPct: 50 }))).toBe(25);
  });
  it("defaults to 100% deductible when the line is unknown", () => {
    expect(deductibleAmount(exp({ business: true, taxCategory: "nonsense", amount: 40 }))).toBe(40);
  });
  it("clamps an out-of-range business percentage", () => {
    expect(deductibleAmount(exp({ business: true, taxCategory: "supplies", amount: 100, businessPct: 500 }))).toBe(100);
    expect(deductibleAmount(exp({ business: true, taxCategory: "supplies", amount: 100, businessPct: -20 }))).toBe(0);
  });
});

describe("taxSummary", () => {
  it("counts only business income actually marked received in the year", () => {
    const d = base({
      incomes: [{
        id: "i", name: "Training", amount: 500, frequency: "monthly",
        anchorDate: "2026-01-05", business: true,
        received: { "2026-01-05": true, "2026-02-05": true, "2025-12-05": true, "2026-03-05": false },
      }],
    });
    expect(taxSummary(d, 2026).businessIncome).toBe(1000);
  });

  it("ignores personal income and personal expenses", () => {
    const d = base({
      incomes: [{ id: "w2", name: "Day job", amount: 3000, frequency: "monthly", anchorDate: "2026-01-01", received: { "2026-01-01": true } }],
      expenses: [exp({ id: "p", business: false, amount: 250, date: "2026-02-01" })],
    });
    const s = taxSummary(d, 2026);
    expect(s.businessIncome).toBe(0);
    expect(s.totalDeductions).toBe(0);
  });

  it("groups deductions by Schedule C line", () => {
    const d = base({
      expenses: [
        exp({ id: "1", business: true, taxCategory: "supplies", amount: 200, date: "2026-01-10" }),
        exp({ id: "2", business: true, taxCategory: "supplies", amount: 100, date: "2026-02-10" }),
        exp({ id: "3", business: true, taxCategory: "meals", amount: 80, date: "2026-02-11" }),
      ],
    });
    const s = taxSummary(d, 2026);
    const supplies = s.lines.find((l) => l.id === "supplies")!;
    expect(supplies).toMatchObject({ gross: 300, deductible: 300, count: 2, line: "22" });
    expect(s.lines.find((l) => l.id === "meals")!.deductible).toBe(40);
    expect(s.totalDeductions).toBe(340);
  });

  it("flags business expenses missing a Schedule C line instead of silently dropping them", () => {
    const d = base({ expenses: [exp({ id: "1", business: true, amount: 75, date: "2026-05-01" })] });
    const s = taxSummary(d, 2026);
    expect(s.uncategorized).toEqual({ gross: 75, count: 1 });
    expect(s.needsReview).toBe(1);
    expect(s.totalDeductions).toBe(0); // uncategorized never inflates the deduction
  });

  it("adds the mileage deduction at the configured rate", () => {
    const d = base({ mileage: [
      { id: "m1", date: "2026-04-01", miles: 100, purpose: "Client visit" },
      { id: "m2", date: "2025-04-01", miles: 999, purpose: "Prior year" },
    ] });
    const s = taxSummary(d, 2026);
    expect(s.miles).toBe(100);
    expect(s.mileageDeduction).toBe(70);
  });

  it("computes net profit and an SE tax estimate", () => {
    const d = base({
      incomes: [{ id: "i", name: "Training", amount: 10000, frequency: "once", anchorDate: "2026-01-05", business: true, received: { "2026-01-05": true } }],
      expenses: [exp({ id: "1", business: true, taxCategory: "supplies", amount: 2000, date: "2026-01-10" })],
    });
    const s = taxSummary(d, 2026);
    expect(s.netProfit).toBe(8000);
    expect(s.selfEmploymentTax).toBeCloseTo(8000 * 0.9235 * 0.153, 2);
  });

  it("does not produce negative SE tax on a loss", () => {
    expect(seTaxEstimate(-5000)).toBe(0);
  });
});

describe("schedule C table", () => {
  it("has unique ids and only meals are partially deductible", () => {
    const ids = SCHEDULE_C.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    const partial = SCHEDULE_C.filter((l) => l.deductiblePct !== 100);
    expect(partial.map((l) => l.id)).toEqual(["meals"]);
  });
});

describe("quarterlyDueDates", () => {
  it("puts Q4 in the following January", () => {
    const q = quarterlyDueDates(2026);
    expect(q).toHaveLength(4);
    expect(q[0].due).toBe("2026-04-15");
    expect(q[3].due).toBe("2027-01-15");
  });
});

describe("mileageCsvRows", () => {
  it("emits a header plus per-trip deduction, oldest first", () => {
    const rows = mileageCsvRows([
      { id: "b", date: "2026-02-01", miles: 10, purpose: "Second" },
      { id: "a", date: "2026-01-01", miles: 20, purpose: "First", from: "Home", to: "Gym" },
    ], 0.7);
    expect(rows[0][0]).toBe("Date");
    expect(rows[1]).toEqual(["2026-01-01", 20, "First", "Home", "Gym", "0.700", "14.00"]);
    expect(rows[2][6]).toBe("7.00");
  });
});
