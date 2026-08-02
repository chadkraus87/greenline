// Row (snake_case, Postgres) → app object (camelCase). Postgres `numeric` comes
// back from supabase-js as a string, so every numeric field is coerced here.
import type { Bill, CalEvent, Category, Debt, Expense, Goal, IncomeSource, Settings, SinkingFund } from "../types";

type Row = Record<string, unknown>;
const n = (v: unknown, fb = 0): number => { const x = Number(v); return Number.isFinite(x) ? x : fb; };
const s = (v: unknown): string => (v == null ? "" : String(v));
const map = (v: unknown): Record<string, boolean> => (v && typeof v === "object" ? (v as Record<string, boolean>) : {});

export const settingsFromRow = (r: Row): Settings => ({
  theme: r.theme === "light" ? "light" : "dark",
  clock24: Boolean(r.clock24),
  startBalance: n(r.start_balance),
  bufferFloor: n(r.buffer_floor),
  extraDebtBudget: n(r.extra_debt_budget),
  emergencyMonths: n(r.emergency_months, 3),
});

export const categoryFromRow = (r: Row): Category => ({ id: s(r.id), name: s(r.name), color: s(r.color), limit: n(r.monthly_limit) });

export const incomeFromRow = (r: Row): IncomeSource => ({
  id: s(r.id), name: s(r.name), amount: n(r.amount),
  frequency: r.frequency as IncomeSource["frequency"], anchorDate: s(r.anchor_date),
  received: map(r.received), taxRate: r.tax_rate == null ? undefined : n(r.tax_rate),
});

export const billFromRow = (r: Row): Bill => ({
  id: s(r.id), name: s(r.name), amount: n(r.amount), categoryId: s(r.category_id),
  dueDay: n(r.due_day, 1), priority: (r.priority as Bill["priority"]) ?? "normal",
  notes: r.notes == null ? undefined : s(r.notes), paused: Boolean(r.paused), paid: map(r.paid),
});

export const expenseFromRow = (r: Row): Expense => ({
  id: s(r.id), title: s(r.title), amount: n(r.amount), categoryId: s(r.category_id),
  date: s(r.date), merchant: r.merchant == null ? undefined : s(r.merchant),
  notes: r.notes == null ? undefined : s(r.notes),
});

export const goalFromRow = (r: Row): Goal => ({
  id: s(r.id), name: s(r.name), target: n(r.target), saved: n(r.saved), monthly: n(r.monthly), color: s(r.color),
});

export const eventFromRow = (r: Row): CalEvent => ({
  id: s(r.id), title: s(r.title), date: s(r.date), notes: r.notes == null ? undefined : s(r.notes), color: s(r.color),
});

export const sinkingFromRow = (r: Row): SinkingFund => ({
  id: s(r.id), name: s(r.name), total: n(r.total), cadenceMonths: n(r.cadence_months, 12),
  dueDate: s(r.due_date), saved: n(r.saved), color: s(r.color),
  categoryId: r.category_id == null ? undefined : s(r.category_id),
});

export const debtFromRow = (r: Row): Debt => ({
  id: s(r.id), name: s(r.name), balance: n(r.balance), apr: n(r.apr), minPayment: n(r.min_payment), color: s(r.color),
});

// App object → snake_case row (id preserved), used by backup restore (importAll).
export const settingsToRow = (v: Settings) => ({
  theme: v.theme, clock24: v.clock24, start_balance: v.startBalance,
  buffer_floor: v.bufferFloor, extra_debt_budget: v.extraDebtBudget, emergency_months: v.emergencyMonths,
});
export const categoryToRow = (c: Category, i = 0) => ({ id: c.id, name: c.name, color: c.color, monthly_limit: c.limit, sort_order: i });
export const incomeToRow = (v: IncomeSource) => ({ id: v.id, name: v.name, amount: v.amount, frequency: v.frequency, anchor_date: v.anchorDate, received: v.received, tax_rate: v.taxRate ?? 0 });
export const billToRow = (v: Bill) => ({ id: v.id, name: v.name, amount: v.amount, category_id: v.categoryId || null, due_day: v.dueDay, priority: v.priority, notes: v.notes ?? null, paused: v.paused ?? false, paid: v.paid });
export const expenseToRow = (v: Expense) => ({ id: v.id, title: v.title, amount: v.amount, category_id: v.categoryId || null, date: v.date, merchant: v.merchant ?? null, notes: v.notes ?? null });
export const goalToRow = (v: Goal) => ({ id: v.id, name: v.name, target: v.target, saved: v.saved, monthly: v.monthly, color: v.color });
export const eventToRow = (v: CalEvent) => ({ id: v.id, title: v.title, date: v.date, notes: v.notes ?? null, color: v.color });
export const sinkingToRow = (v: SinkingFund) => ({ id: v.id, name: v.name, total: v.total, cadence_months: v.cadenceMonths, due_date: v.dueDate, saved: v.saved, category_id: v.categoryId || null, color: v.color });
export const debtToRow = (v: Debt) => ({ id: v.id, name: v.name, balance: v.balance, apr: v.apr, min_payment: v.minPayment, color: v.color });
