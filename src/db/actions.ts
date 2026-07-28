import { db } from "./db";
import type { Bill, CalEvent, Expense, Goal, IncomeSource } from "../types";
import { uid } from "../lib/money";

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
