import { supabase } from "../lib/supabase";
import type { Bill, CalEvent, Category, Debt, Expense, Goal, IncomeSource, SinkingFund } from "../types";
import { round2 } from "../lib/money";
import { emitDataChange } from "../data/sync";

/** All mutations in one place. Every write emits a change so the UI refetches.
 *  Deletes return an undo closure that re-inserts the exact row. */
export type UndoFn = () => Promise<void>;

const done = () => emitDataChange();
const table = (t: string) => supabase.from(t);

async function getRow(t: string, id: string): Promise<Record<string, unknown> | null> {
  const { data } = await table(t).select("*").eq("id", id).maybeSingle();
  return data ?? null;
}
function undoInsert(t: string, row: Record<string, unknown>): UndoFn {
  return async () => { await table(t).insert(row); done(); };
}

// --- Bills ---
export const saveBill = async (f: Omit<Bill, "id" | "paid"> & { id?: string }) => {
  const row = { name: f.name, amount: f.amount, category_id: f.categoryId || null, due_day: f.dueDay, priority: f.priority, notes: f.notes ?? null, paused: f.paused ?? false };
  if (f.id) await table("bills").update(row).eq("id", f.id);
  else await table("bills").insert({ ...row, paid: {} });
  done();
};
export const duplicateBill = async (id: string) => {
  const b = await getRow("bills", id);
  if (b) { const { id: _i, user_id: _u, created_at: _c, ...rest } = b; await table("bills").insert({ ...rest, name: `${b.name} (copy)`, paid: {} }); done(); }
};
export const deleteBill = async (id: string): Promise<UndoFn | null> => {
  const b = await getRow("bills", id);
  if (!b) return null;
  await table("bills").delete().eq("id", id);
  done();
  return undoInsert("bills", b);
};
export const toggleBillPaid = async (id: string, ym: string) => {
  const b = await getRow("bills", id);
  if (!b) return;
  const paid = (b.paid ?? {}) as Record<string, boolean>;
  await table("bills").update({ paid: { ...paid, [ym]: !paid[ym] } }).eq("id", id);
  done();
};
export const togglePauseBill = async (id: string) => {
  const b = await getRow("bills", id);
  if (b) { await table("bills").update({ paused: !b.paused }).eq("id", id); done(); }
};

// --- Income ---
export const saveIncome = async (f: Omit<IncomeSource, "id" | "received"> & { id?: string }) => {
  const row = { name: f.name, amount: f.amount, frequency: f.frequency, anchor_date: f.anchorDate, tax_rate: f.taxRate ?? 0 };
  if (f.id) await table("incomes").update(row).eq("id", f.id);
  else await table("incomes").insert({ ...row, received: {} });
  done();
};
export const deleteIncome = async (id: string): Promise<UndoFn | null> => {
  const i = await getRow("incomes", id);
  if (!i) return null;
  await table("incomes").delete().eq("id", id);
  done();
  return undoInsert("incomes", i);
};
export const toggleIncomeReceived = async (id: string, date: string) => {
  const i = await getRow("incomes", id);
  if (!i) return;
  const received = (i.received ?? {}) as Record<string, boolean>;
  await table("incomes").update({ received: { ...received, [date]: !received[date] } }).eq("id", id);
  done();
};

// --- Expenses ---
export const saveExpense = async (f: Omit<Expense, "id"> & { id?: string }) => {
  const row = { title: f.title, amount: f.amount, category_id: f.categoryId || null, date: f.date, merchant: f.merchant ?? null, notes: f.notes ?? null };
  if (f.id) await table("expenses").update(row).eq("id", f.id);
  else await table("expenses").insert(row);
  done();
};
export const deleteExpense = async (id: string): Promise<UndoFn | null> => {
  const e = await getRow("expenses", id);
  if (!e) return null;
  await table("expenses").delete().eq("id", id);
  done();
  return undoInsert("expenses", e);
};

// --- Goals ---
export const saveGoal = async (f: Omit<Goal, "id"> & { id?: string }) => {
  const row = { name: f.name, target: f.target, saved: f.saved, monthly: f.monthly, color: f.color };
  if (f.id) await table("goals").update(row).eq("id", f.id);
  else await table("goals").insert(row);
  done();
};
export const deleteGoal = async (id: string): Promise<UndoFn | null> => {
  const g = await getRow("goals", id);
  if (!g) return null;
  await table("goals").delete().eq("id", id);
  done();
  return undoInsert("goals", g);
};
export const contributeToGoal = async (id: string) => {
  const g = await getRow("goals", id);
  if (g) { await table("goals").update({ saved: round2(Number(g.saved) + (Number(g.monthly) || 0)) }).eq("id", id); done(); }
};

// --- Events ---
export const saveEvent = async (f: Omit<CalEvent, "id"> & { id?: string }) => {
  const row = { title: f.title, date: f.date, notes: f.notes ?? null, color: f.color };
  if (f.id) await table("events").update(row).eq("id", f.id);
  else await table("events").insert(row);
  done();
};
export const deleteEvent = async (id: string) => { await table("events").delete().eq("id", id); done(); };

// --- Categories ---
export const setCategoryLimit = async (id: string, limit: number) => { await table("categories").update({ monthly_limit: limit }).eq("id", id); done(); };
export const addCategory = async (f: { name: string; color: string; limit?: number }) => { await table("categories").insert({ name: f.name, color: f.color, monthly_limit: f.limit ?? 0, sort_order: 100 }); done(); };
export const updateCategory = async (id: string, patch: Partial<Omit<Category, "id">>) => {
  const row: Record<string, unknown> = {};
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.color !== undefined) row.color = patch.color;
  if (patch.limit !== undefined) row.monthly_limit = patch.limit;
  await table("categories").update(row).eq("id", id);
  done();
};
export const deleteCategory = async (id: string, fallbackId: string): Promise<UndoFn | null> => {
  const cat = await getRow("categories", id);
  if (!cat) return null;
  const { data: bills } = await table("bills").select("id").eq("category_id", id);
  const { data: exps } = await table("expenses").select("id").eq("category_id", id);
  const billIds = (bills ?? []).map((b) => (b as { id: string }).id);
  const expIds = (exps ?? []).map((e) => (e as { id: string }).id);
  await table("bills").update({ category_id: fallbackId }).eq("category_id", id);
  await table("expenses").update({ category_id: fallbackId }).eq("category_id", id);
  await table("categories").delete().eq("id", id);
  done();
  return async () => {
    await table("categories").insert(cat);
    if (billIds.length) await table("bills").update({ category_id: id }).in("id", billIds);
    if (expIds.length) await table("expenses").update({ category_id: id }).in("id", expIds);
    done();
  };
};

// --- Sinking funds ---
export const saveSinkingFund = async (f: Omit<SinkingFund, "id" | "saved"> & { id?: string; saved?: number }) => {
  const row = { name: f.name, total: f.total, cadence_months: f.cadenceMonths, due_date: f.dueDate, saved: f.saved ?? 0, category_id: f.categoryId || null, color: f.color };
  if (f.id) await table("sinking_funds").update(row).eq("id", f.id);
  else await table("sinking_funds").insert(row);
  done();
};
export const deleteSinkingFund = async (id: string): Promise<UndoFn | null> => {
  const s = await getRow("sinking_funds", id);
  if (!s) return null;
  await table("sinking_funds").delete().eq("id", id);
  done();
  return undoInsert("sinking_funds", s);
};
export const contributeToSinkingFund = async (id: string) => {
  const s = await getRow("sinking_funds", id);
  if (!s) return;
  const total = Number(s.total), cadence = Number(s.cadence_months), saved = Number(s.saved);
  await table("sinking_funds").update({ saved: round2(Math.min(total, saved + (cadence > 0 ? total / cadence : 0))) }).eq("id", id);
  done();
};

// --- Debts ---
export const saveDebt = async (f: Omit<Debt, "id"> & { id?: string }) => {
  const row = { name: f.name, balance: f.balance, apr: f.apr, min_payment: f.minPayment, color: f.color };
  if (f.id) await table("debts").update(row).eq("id", f.id);
  else await table("debts").insert(row);
  done();
};
export const deleteDebt = async (id: string): Promise<UndoFn | null> => {
  const d = await getRow("debts", id);
  if (!d) return null;
  await table("debts").delete().eq("id", id);
  done();
  return undoInsert("debts", d);
};
