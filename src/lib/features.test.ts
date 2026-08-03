import { describe, it, expect } from "vitest";
import { simulatePayoff, comparePayoff } from "./debt";
import { monthlyHistory, netWorth, emergencyFund, categoryVariance, burnPace, categoryRollover } from "./insights";
import { computeMonth } from "./forecast";
import type { AppData, Debt } from "../types";

const empty = (over: Partial<AppData> = {}): AppData => ({
  settings: { theme: "dark", clock24: false, startBalance: 0, bufferFloor: 0, extraDebtBudget: 0, emergencyMonths: 3, rolloverBudgets: false },
  categories: [], incomes: [], bills: [], expenses: [], goals: [], events: [], sinkingFunds: [], debts: [],
  ...over,
});
const today = new Date(2026, 6, 20);

describe("debt payoff engine", () => {
  it("pays a single debt off in finite time and charges interest", () => {
    const d: Debt[] = [{ id: "a", name: "Card", balance: 1000, apr: 18, minPayment: 50, color: "#000" }];
    const plan = simulatePayoff(d, 100, "avalanche");
    expect(plan.feasible).toBe(true);
    expect(plan.months).toBeGreaterThan(0);
    expect(plan.months).toBeLessThan(24);
    expect(plan.totalInterest).toBeGreaterThan(0);
    expect(plan.totalPaid).toBeCloseTo(1000 + plan.totalInterest, 2);
  });

  it("avalanche costs no more interest than snowball", () => {
    const debts: Debt[] = [
      { id: "a", name: "High APR big", balance: 2000, apr: 24, minPayment: 40, color: "#000" },
      { id: "b", name: "Low APR small", balance: 500, apr: 10, minPayment: 20, color: "#000" },
    ];
    const { avalanche, snowball } = comparePayoff(debts, 150);
    expect(avalanche.feasible && snowball.feasible).toBe(true);
    expect(avalanche.totalInterest).toBeLessThanOrEqual(snowball.totalInterest + 0.01);
  });

  it("flags infeasible when the budget can't overcome interest", () => {
    const d: Debt[] = [{ id: "a", name: "Trap", balance: 10000, apr: 30, minPayment: 10, color: "#000" }];
    const plan = simulatePayoff(d, 0, "avalanche");
    expect(plan.feasible).toBe(false);
    expect(plan.months).toBe(Infinity);
  });

  it("no debts → trivially done", () => {
    expect(simulatePayoff([], 0, "snowball").months).toBe(0);
  });
});

describe("forecast reserves & buffer", () => {
  it("tax rate on income is reserved out of remaining", () => {
    const d = empty({ incomes: [{ id: "i", name: "Gig", amount: 1000, frequency: "monthly", anchorDate: "2026-07-01", received: {}, taxRate: 25 }] });
    const m = computeMonth(d, 2026, 6, today);
    expect(m.taxReserve).toBe(250);
    expect(m.remaining).toBe(1000 - 250);
  });

  it("sinking fund reserves its monthly slice", () => {
    const d = empty({
      incomes: [{ id: "i", name: "Pay", amount: 1200, frequency: "monthly", anchorDate: "2026-07-01", received: {} }],
      sinkingFunds: [{ id: "s", name: "Insurance", total: 1200, cadenceMonths: 12, dueDate: "2026-12-01", saved: 0, color: "#000" }],
    });
    const m = computeMonth(d, 2026, 6, today);
    expect(m.sinkingReserve).toBe(100);
    expect(m.remaining).toBe(1200 - 100);
  });

  it("buffer floor flags the crossing day and docks health", () => {
    const d = empty({
      settings: { theme: "dark", clock24: false, startBalance: 300, bufferFloor: 500, extraDebtBudget: 0, emergencyMonths: 3, rolloverBudgets: false },
      bills: [{ id: "b", name: "Rent", amount: 100, categoryId: "c", dueDay: 5, priority: "normal", paid: {} }],
    });
    const m = computeMonth(d, 2026, 6, today);
    expect(m.firstBelowBuffer?.day).toBe(1); // starts at 300, already below 500
    expect(m.health).toBeLessThan(100);
  });
});

describe("insights", () => {
  it("monthlyHistory returns the requested number of points", () => {
    expect(monthlyHistory(empty(), 2026, 6, today, 6)).toHaveLength(6);
  });
  it("net worth = savings minus debt", () => {
    const d = empty({
      goals: [{ id: "g", name: "EF", target: 5000, saved: 2000, monthly: 0, color: "#000" }],
      sinkingFunds: [{ id: "s", name: "Car", total: 1200, cadenceMonths: 12, dueDate: "2026-12-01", saved: 300, color: "#000" }],
      debts: [{ id: "x", name: "Loan", balance: 1500, apr: 5, minPayment: 50, color: "#000" }],
    });
    expect(netWorth(d)).toEqual({ assets: 2300, debts: 1500, net: 800 });
  });
  it("emergency fund target scales with months", () => {
    const d = empty({
      settings: { theme: "dark", clock24: false, startBalance: 0, bufferFloor: 0, extraDebtBudget: 0, emergencyMonths: 6, rolloverBudgets: false },
      bills: [{ id: "b", name: "Rent", amount: 1000, categoryId: "c", dueDay: 1, priority: "normal", paid: {} }],
    });
    const m = computeMonth(d, 2026, 6, today);
    const ef = emergencyFund(d, m, 2026, 6, today);
    expect(ef.monthlyNeed).toBe(1000);
    expect(ef.target).toBe(6000);
  });
  it("category variance averages spend against limit", () => {
    const d = empty({
      categories: [{ id: "food", name: "Food", color: "#000", limit: 100 }],
      expenses: [{ id: "e", title: "x", amount: 150, categoryId: "food", date: "2026-07-05" }],
    });
    const v = categoryVariance(d, 2026, 6, today, 1).find((c) => c.id === "food")!;
    expect(v.avgSpend).toBe(150);
    expect(v.variancePct).toBe(50);
  });
  it("rollover accumulates unspent budget from prior months", () => {
    const d = empty({ categories: [{ id: "food", name: "Food", color: "#000", limit: 100 }] });
    // 3 clean months before July with nothing spent → 3 × $100 carried in.
    expect(categoryRollover(d, 2026, 6, today, 3).food).toBe(300);
  });
  it("rollover is reduced by overspending and never goes negative", () => {
    const cats = [{ id: "food", name: "Food", color: "#000", limit: 100 }];
    // One prior month (June) blown by $500 against a $100 limit → floors at 0.
    const over = empty({ categories: cats, expenses: [{ id: "e", title: "x", amount: 600, categoryId: "food", date: "2026-06-10" }] });
    expect(categoryRollover(over, 2026, 6, today, 1).food).toBe(0);
    // Partial spend: June limit 100, spent 40 → 60 carried.
    const partial = empty({ categories: cats, expenses: [{ id: "e", title: "x", amount: 40, categoryId: "food", date: "2026-06-10" }] });
    expect(categoryRollover(partial, 2026, 6, today, 1).food).toBe(60);
  });
  it("categories without a limit are not tracked for rollover", () => {
    const d = empty({ categories: [{ id: "misc", name: "Misc", color: "#000", limit: 0 }] });
    expect(categoryRollover(d, 2026, 6, today, 3).misc).toBeUndefined();
  });
  it("burn pace flags a category spending faster than the month elapses", () => {
    const d = empty({
      categories: [{ id: "food", name: "Food", color: "#000", limit: 100 }],
      expenses: [{ id: "e", title: "x", amount: 90, categoryId: "food", date: "2026-07-03" }],
    });
    const m = computeMonth(d, 2026, 6, today);
    const paced = burnPace(m, d.categories, 20); // 20% of month elapsed, 90% spent
    expect(paced.find((b) => b.id === "food")?.over).toBe(true);
  });
});
