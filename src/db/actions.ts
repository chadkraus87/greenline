import { db } from "./db";
import type { Bill, CalEvent, Category, Debt, Expense, Goal, IncomeSource, SinkingFund } from "../types";
import { uid, round2 } from "../lib/money";

/** All mutations in one place. Deletes return an undo closure. */
export type UndoFn = () => Promise<void>;

export const saveBill = async (f: Omit<Bill, "id" | "paid"> & { id?: string }) =>
  f.id ? db.bills.update(f.id, f) : db.bills.add({ ...f, id: uid(), paid: {} });
export const duplicateBill = async (id: string) => {
  const b = await db.bills.get(id);
  if (b) await db.bills.add({ ...b, id: uid(), name: `${b.name} (copy)`, paid: {} });
};
export const deleteBill = async (id: string): Promise<UndoFn | null> => {
  const b = await db.bills.get(id);
  if (!b) return null;
  await db.bills.delete(id);
  return async () => { await db.bills.add(b); };
};
export const toggleBillPaid = async (id: string, ym: string) => {
  const b = await db.bills.get(id);
  if (b) await db.bills.update(id, { paid: { ...b.paid, [ym]: !b.paid?.[ym] } });
};
export const togglePauseBill = async (id: string) => {
  const b = await db.bills.get(id);
  if (b) await db.bills.update(id, { paused: !b.paused });
};

export const saveIncome = async (f: Omit<IncomeSource, "id" | "received"> & { id?: string }) =>
  f.id ? db.incomes.update(f.id, f) : db.incomes.add({ ...f, id: uid(), received: {} });
export const deleteIncome = async (id: string): Promise<UndoFn | null> => {
  const i = await db.incomes.get(id);
  if (!i) return null;
  await db.incomes.delete(id);
  return async () => { await db.incomes.add(i); };
};
export const toggleIncomeReceived = async (id: string, date: string) => {
  const i = await db.incomes.get(id);
  if (i) await db.incomes.update(id, { received: { ...i.received, [date]: !i.received?.[date] } });
};

export const saveExpense = async (f: Omit<Expense, "id"> & { id?: string }) =>
  f.id ? db.expenses.update(f.id, f) : db.expenses.add({ ...f, id: uid() });
export const deleteExpense = async (id: string): Promise<UndoFn | null> => {
  const e = await db.expenses.get(id);
  if (!e) return null;
  await db.expenses.delete(id);
  return async () => { await db.expenses.add(e); };
};

export const saveGoal = async (f: Omit<Goal, "id"> & { id?: string }) =>
  f.id ? db.goals.update(f.id, f) : db.goals.add({ ...f, id: uid() });
export const deleteGoal = async (id: string): Promise<UndoFn | null> => {
  const g = await db.goals.get(id);
  if (!g) return null;
  await db.goals.delete(id);
  return async () => { await db.goals.add(g); };
};
export const contributeToGoal = async (id: string) => {
  const g = await db.goals.get(id);
  if (g) await db.goals.update(id, { saved: Math.round((g.saved + (g.monthly || 0)) * 100) / 100 });
};

export const saveEvent = async (f: Omit<CalEvent, "id"> & { id?: string }) =>
  f.id ? db.events.update(f.id, f) : db.events.add({ ...f, id: uid() });
export const deleteEvent = async (id: string) => db.events.delete(id);

export const setCategoryLimit = async (id: string, limit: number) => db.categories.update(id, { limit });

// --- Category management (add / rename / recolor / delete) ---
export const addCategory = async (f: { name: string; color: string; limit?: number }) =>
  db.categories.add({ id: uid(), name: f.name, color: f.color, limit: f.limit ?? 0 });
export const updateCategory = async (id: string, patch: Partial<Omit<Category, "id">>) => db.categories.update(id, patch);
/** Deletes a category and reassigns its bills/expenses to `fallbackId` (undoable). */
export const deleteCategory = async (id: string, fallbackId: string): Promise<UndoFn | null> => {
  const cat = await db.categories.get(id);
  if (!cat) return null;
  const bills = await db.bills.where("categoryId").equals(id).toArray();
  const expenses = await db.expenses.where("categoryId").equals(id).toArray();
  await db.transaction("rw", [db.categories, db.bills, db.expenses], async () => {
    await Promise.all(bills.map((b) => db.bills.update(b.id, { categoryId: fallbackId })));
    await Promise.all(expenses.map((e) => db.expenses.update(e.id, { categoryId: fallbackId })));
    await db.categories.delete(id);
  });
  return async () => {
    await db.transaction("rw", [db.categories, db.bills, db.expenses], async () => {
      await db.categories.add(cat);
      await Promise.all(bills.map((b) => db.bills.update(b.id, { categoryId: id })));
      await Promise.all(expenses.map((e) => db.expenses.update(e.id, { categoryId: id })));
    });
  };
};

// --- Sinking funds (reserve monthly for irregular bills) ---
export const saveSinkingFund = async (f: Omit<SinkingFund, "id" | "saved"> & { id?: string; saved?: number }) =>
  f.id ? db.sinkingFunds.update(f.id, f) : db.sinkingFunds.add({ ...f, id: uid(), saved: f.saved ?? 0 });
export const deleteSinkingFund = async (id: string): Promise<UndoFn | null> => {
  const s = await db.sinkingFunds.get(id);
  if (!s) return null;
  await db.sinkingFunds.delete(id);
  return async () => { await db.sinkingFunds.add(s); };
};
export const contributeToSinkingFund = async (id: string) => {
  const s = await db.sinkingFunds.get(id);
  if (s) await db.sinkingFunds.update(id, { saved: round2(Math.min(s.total, s.saved + (s.cadenceMonths > 0 ? s.total / s.cadenceMonths : 0))) });
};

// --- Debts (payoff tracker) ---
export const saveDebt = async (f: Omit<Debt, "id"> & { id?: string }) =>
  f.id ? db.debts.update(f.id, f) : db.debts.add({ ...f, id: uid() });
export const deleteDebt = async (id: string): Promise<UndoFn | null> => {
  const d = await db.debts.get(id);
  if (!d) return null;
  await db.debts.delete(id);
  return async () => { await db.debts.add(d); };
};
