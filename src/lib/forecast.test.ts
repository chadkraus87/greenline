import { describe, it, expect } from "vitest";
import { computeMonth } from "./forecast";
import type { AppData } from "../types";

const base = (): AppData => ({
  settings: { theme: "dark", clock24: false, startBalance: 500, bufferFloor: 0, extraDebtBudget: 0, emergencyMonths: 3, rolloverBudgets: false, businessMode: false, mileageRate: 0.7 },
  categories: [{ id: "housing", name: "Housing", color: "#46B380", limit: 0 }],
  incomes: [{ id: "i1", name: "Pay", amount: 2000, frequency: "monthly", anchorDate: "2026-01-05", received: { "2026-07-05": true } }],
  bills: [{ id: "b1", name: "Rent", amount: 1200, categoryId: "housing", dueDay: 1, priority: "high", paid: {} }],
  expenses: [{ id: "e1", title: "Groceries", amount: 150, categoryId: "housing", date: "2026-07-10" }],
  goals: [{ id: "g1", name: "EF", target: 5000, saved: 100, monthly: 200, color: "#5FA8D3" }],
  events: [], sinkingFunds: [], debts: [], mileage: [],
});
const today = new Date(2026, 6, 20);

describe("computeMonth", () => {
  it("computes totals", () => {
    const m = computeMonth(base(), 2026, 6, today);
    expect(m.expectedIncome).toBe(2000);
    expect(m.actualIncome).toBe(2000);
    expect(m.billsTotal).toBe(1200);
    expect(m.expensesTotal).toBe(150);
    expect(m.remaining).toBe(2000 - 1200 - 150 - 200);
  });
  it("daily forecast walks the balance and ends correctly", () => {
    const m = computeMonth(base(), 2026, 6, today);
    expect(m.forecast[0].balance).toBe(500 - 1200);       // rent day 1
    expect(m.forecast[4].balance).toBe(500 - 1200 + 2000); // pay day 5
    expect(m.projectedEnd).toBe(500 - 1200 + 2000 - 150);
  });
  it("flags the first negative-balance day", () => {
    const m = computeMonth(base(), 2026, 6, today);
    expect(m.firstDip?.day).toBe(1);
  });
  it("marks unpaid past-due bills overdue and docks health", () => {
    const m = computeMonth(base(), 2026, 6, today);
    expect(m.billOccs[0].overdue).toBe(true);
    expect(m.health).toBeLessThan(100);
  });
  it("paid bills are not overdue and count into category spend", () => {
    const d = base();
    d.bills[0].paid = { "2026-07": true };
    const m = computeMonth(d, 2026, 6, today);
    expect(m.billOccs[0].overdue).toBe(false);
    expect(m.catSpend.housing).toBe(1200 + 150);
  });
  it("over-limit categories dock health, bounded 0-100", () => {
    const d = base();
    d.categories[0].limit = 100;
    d.bills[0].paid = { "2026-07": true };
    const m = computeMonth(d, 2026, 6, today);
    expect(m.health).toBeGreaterThanOrEqual(0);
    expect(m.health).toBeLessThan(100);
  });
  it("paused bills are excluded", () => {
    const d = base();
    d.bills[0].paused = true;
    const m = computeMonth(d, 2026, 6, today);
    expect(m.billOccs).toHaveLength(0);
    expect(m.billsTotal).toBe(0);
  });
});
