import type { AppData, Category, MonthModel } from "../types";
import { computeMonth } from "./forecast";
import { round2 } from "./money";
import { MONTHS } from "./dates";

export interface MonthPoint { ym: string; label: string; income: number; spent: number; savingsRate: number; }

/** Trailing `count` months ending at (y, m), oldest → newest. Derived from stored data. */
export function monthlyHistory(data: AppData, y: number, m: number, today: Date, count = 6): MonthPoint[] {
  const out: MonthPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - i, 1);
    const mm = computeMonth(data, d.getFullYear(), d.getMonth(), today);
    out.push({
      ym: mm.ym,
      label: `${MONTHS[d.getMonth()].slice(0, 3)} '${String(d.getFullYear()).slice(2)}`,
      income: mm.expectedIncome,
      spent: mm.spent,
      savingsRate: mm.savingsRate,
    });
  }
  return out;
}

export interface CategoryVariance { id: string; name: string; color: string; limit: number; avgSpend: number; variancePct: number; }

/** Average spend per category over the trailing `count` months vs. its limit. */
export function categoryVariance(data: AppData, y: number, m: number, today: Date, count = 3): CategoryVariance[] {
  const totals: Record<string, number> = {};
  for (let i = 0; i < count; i++) {
    const d = new Date(y, m - i, 1);
    const mm = computeMonth(data, d.getFullYear(), d.getMonth(), today);
    for (const c of data.categories) totals[c.id] = round2((totals[c.id] || 0) + (mm.catSpend[c.id] || 0));
  }
  return data.categories.map((c) => {
    const avgSpend = round2((totals[c.id] || 0) / count);
    const variancePct = c.limit > 0 ? Math.round(((avgSpend - c.limit) / c.limit) * 100) : 0;
    return { id: c.id, name: c.name, color: c.color, limit: c.limit, avgSpend, variancePct };
  });
}

export interface EmergencyFund { monthlyNeed: number; target: number; saved: number; monthsCovered: number; }

/** Emergency-fund target = emergencyMonths × average monthly obligations (bills + expenses). */
export function emergencyFund(data: AppData, month: MonthModel, y: number, m: number, today: Date): EmergencyFund {
  const hist = monthlyHistory(data, y, m, today, 3);
  const avgSpent = hist.length ? round2(hist.reduce((s, p) => s + p.spent, 0) / hist.length) : 0;
  const monthlyNeed = round2(Math.max(month.billsTotal, avgSpent));
  const months = Math.max(1, data.settings.emergencyMonths || 3);
  const saved = round2(data.goals.reduce((s, g) => s + g.saved, 0) + data.sinkingFunds.reduce((s, f) => s + f.saved, 0));
  return { monthlyNeed, target: round2(monthlyNeed * months), saved, monthsCovered: monthlyNeed > 0 ? round2(saved / monthlyNeed) : 0 };
}

export interface NetWorth { assets: number; debts: number; net: number; }

/** Simple snapshot: liquid savings (goals + sinking funds) minus debt balances. */
export function netWorth(data: AppData): NetWorth {
  const assets = round2(data.goals.reduce((s, g) => s + g.saved, 0) + data.sinkingFunds.reduce((s, f) => s + f.saved, 0));
  const debts = round2(data.debts.reduce((s, d) => s + d.balance, 0));
  return { assets, debts, net: round2(assets - debts) };
}

export interface BurnPace { id: string; name: string; color: string; limit: number; spent: number; spentPct: number; elapsedPct: number; over: boolean; }

/** Categories tracking to blow their limit given how much of the month has elapsed. */
export function burnPace(month: MonthModel, categories: Category[], elapsedPct: number): BurnPace[] {
  return categories
    .filter((c) => c.limit > 0)
    .map((c) => {
      const spent = month.catSpend[c.id] || 0;
      const spentPct = Math.round((spent / c.limit) * 100);
      return { id: c.id, name: c.name, color: c.color, limit: c.limit, spent, spentPct, elapsedPct: Math.round(elapsedPct), over: spentPct > elapsedPct + 10 && spentPct > 25 };
    })
    .filter((b) => b.over)
    .sort((a, b) => b.spentPct - a.spentPct);
}
