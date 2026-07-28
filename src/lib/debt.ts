import type { Debt } from "../types";
import { round2 } from "./money";

export type Strategy = "avalanche" | "snowball";

export interface DebtPlanRow { id: string; name: string; months: number; interest: number; }
export interface DebtPlan {
  strategy: Strategy;
  monthlyBudget: number;     // minimums + extra
  months: number;            // Infinity if the budget can't overcome interest
  totalInterest: number;
  totalPaid: number;
  payoff: DebtPlanRow[];
  feasible: boolean;
}

/**
 * Simulate paying off debts month by month. Every debt gets its minimum payment;
 * whatever's left of the budget is thrown at ONE target — the highest-APR debt
 * (avalanche, cheapest overall) or the smallest balance (snowball, most motivating).
 * Interest compounds monthly at apr/12.
 */
export function simulatePayoff(debts: Debt[], extra: number, strategy: Strategy): DebtPlan {
  const active = debts.filter((d) => d.balance > 0).map((d) => ({ ...d }));
  const startBalance = round2(active.reduce((s, d) => s + d.balance, 0));
  const minTotal = round2(active.reduce((s, d) => s + d.minPayment, 0));
  const monthlyBudget = round2(minTotal + Math.max(0, extra));
  const interestById: Record<string, number> = {};
  const monthsById: Record<string, number> = {};
  const order = (a: Debt, b: Debt) => (strategy === "avalanche" ? b.apr - a.apr : a.balance - b.balance);

  if (active.length === 0) {
    return { strategy, monthlyBudget: 0, months: 0, totalInterest: 0, totalPaid: 0, payoff: [], feasible: true };
  }

  let month = 0;
  let feasible = true;
  let prevTotal = startBalance;
  while (active.some((d) => d.balance > 0)) {
    month++;
    if (month > 1200) { feasible = false; break; } // 100-year guard
    // 1) accrue interest
    for (const d of active) {
      if (d.balance <= 0) continue;
      const i = round2(d.balance * (d.apr / 100 / 12));
      d.balance = round2(d.balance + i);
      interestById[d.id] = round2((interestById[d.id] || 0) + i);
    }
    // 2) pay each minimum
    let pool = monthlyBudget;
    for (const d of active) {
      if (d.balance <= 0) continue;
      const pay = Math.min(d.balance, d.minPayment);
      d.balance = round2(d.balance - pay);
      pool = round2(pool - pay);
    }
    // 3) throw the remainder at the strategy target(s)
    for (const d of [...active].filter((x) => x.balance > 0).sort(order)) {
      if (pool <= 0) break;
      const pay = Math.min(d.balance, pool);
      d.balance = round2(d.balance - pay);
      pool = round2(pool - pay);
    }
    for (const d of active) if (d.balance <= 0 && !monthsById[d.id]) monthsById[d.id] = month;
    // no-progress guard: budget can't overcome interest
    const total = round2(active.reduce((s, d) => s + d.balance, 0));
    if (total >= prevTotal - 0.01) { feasible = false; break; }
    prevTotal = total;
  }

  const totalInterest = round2(Object.values(interestById).reduce((s, i) => s + i, 0));
  const payoff: DebtPlanRow[] = debts
    .filter((d) => d.balance > 0)
    .map((d) => ({ id: d.id, name: d.name, months: monthsById[d.id] ?? Infinity, interest: interestById[d.id] || 0 }));
  return {
    strategy,
    monthlyBudget,
    months: feasible ? month : Infinity,
    totalInterest,
    totalPaid: round2(startBalance + totalInterest),
    payoff,
    feasible,
  };
}

/** Compare both strategies at once for the same extra budget. */
export function comparePayoff(debts: Debt[], extra: number): { avalanche: DebtPlan; snowball: DebtPlan } {
  return { avalanche: simulatePayoff(debts, extra, "avalanche"), snowball: simulatePayoff(debts, extra, "snowball") };
}
