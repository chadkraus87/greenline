import { supabase } from "../lib/supabase";
import type { AppData, Settings, Category } from "../types";
import { validateImport } from "../lib/backup";
import { emitDataChange } from "../data/sync";
import * as M from "./mappers";

export const DEFAULT_SETTINGS: Settings = {
  theme: "dark", clock24: false, startBalance: 0,
  bufferFloor: 0, extraDebtBudget: 0, emergencyMonths: 3, rolloverBudgets: false,
  businessMode: false, mileageRate: 0.70,
};

// Kept for reference/UI ordering; the DB seeds these per user on approval.
export const DEFAULT_CATEGORIES: Category[] = [
  { id: "housing", name: "Housing", color: "#46B380", limit: 0 },
  { id: "utilities", name: "Utilities", color: "#5FA8D3", limit: 0 },
  { id: "food", name: "Food & Dining", color: "#D9A441", limit: 0 },
  { id: "transport", name: "Transportation", color: "#7A8FE0", limit: 0 },
  { id: "health", name: "Healthcare", color: "#C77DBA", limit: 0 },
  { id: "entertainment", name: "Entertainment", color: "#E0784C", limit: 0 },
  { id: "debt", name: "Debt", color: "#C4595E", limit: 0 },
  { id: "misc", name: "Miscellaneous", color: "#8FA396", limit: 0 },
];

async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getSettings(): Promise<Settings> {
  const { data } = await supabase.from("settings").select("*").maybeSingle();
  return data ? M.settingsFromRow(data) : DEFAULT_SETTINGS;
}

export async function patchSettings(patch: Partial<Settings>): Promise<void> {
  const uid = await currentUserId();
  if (!uid) return;
  const cur = await getSettings();
  const next = { ...cur, ...patch };
  await supabase.from("settings").upsert({ user_id: uid, ...M.settingsToRow(next) });
  emitDataChange();
}

/** Full snapshot of the signed-in user's data (RLS scopes every query to them). */
export async function loadAll(): Promise<AppData> {
  const [settings, categories, incomes, bills, expenses, goals, events, sinkingFunds, debts, mileage] = await Promise.all([
    getSettings(),
    supabase.from("categories").select("*").order("sort_order").order("name"),
    supabase.from("incomes").select("*"),
    supabase.from("bills").select("*"),
    supabase.from("expenses").select("*").order("date"),
    supabase.from("goals").select("*"),
    supabase.from("events").select("*"),
    supabase.from("sinking_funds").select("*"),
    supabase.from("debts").select("*"),
    supabase.from("mileage").select("*").order("date", { ascending: false }),
  ]);
  return {
    settings,
    categories: (categories.data ?? []).map(M.categoryFromRow),
    incomes: (incomes.data ?? []).map(M.incomeFromRow),
    bills: (bills.data ?? []).map(M.billFromRow),
    expenses: (expenses.data ?? []).map(M.expenseFromRow),
    goals: (goals.data ?? []).map(M.goalFromRow),
    events: (events.data ?? []).map(M.eventFromRow),
    sinkingFunds: (sinkingFunds.data ?? []).map(M.sinkingFromRow),
    debts: (debts.data ?? []).map(M.debtFromRow),
    mileage: (mileage.data ?? []).map(M.mileageFromRow),
  };
}

export const exportAll = loadAll;

const DATA_TABLES = ["categories", "incomes", "bills", "expenses", "goals", "events", "sinking_funds", "debts", "mileage"] as const;

async function clearUserData(uid: string): Promise<void> {
  // RLS already scopes to the user; the explicit filter is defense-in-depth.
  for (const t of DATA_TABLES) await supabase.from(t).delete().eq("user_id", uid);
}

/** Validate, then replace the signed-in user's data with the backup's contents. */
export async function importAll(raw: unknown): Promise<void> {
  const data = validateImport(raw);
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  await clearUserData(uid);
  await supabase.from("settings").upsert({ user_id: uid, ...M.settingsToRow(data.settings) });
  // Categories first so bill/expense category_id references resolve.
  if (data.categories.length) throwOn(await supabase.from("categories").insert(data.categories.map((c, i) => M.categoryToRow(c, i))));
  await Promise.all([
    data.incomes.length && supabase.from("incomes").insert(data.incomes.map(M.incomeToRow)),
    data.bills.length && supabase.from("bills").insert(data.bills.map(M.billToRow)),
    data.expenses.length && supabase.from("expenses").insert(data.expenses.map(M.expenseToRow)),
    data.goals.length && supabase.from("goals").insert(data.goals.map(M.goalToRow)),
    data.events.length && supabase.from("events").insert(data.events.map(M.eventToRow)),
    data.sinkingFunds.length && supabase.from("sinking_funds").insert(data.sinkingFunds.map(M.sinkingToRow)),
    data.debts.length && supabase.from("debts").insert(data.debts.map(M.debtToRow)),
    data.mileage.length && supabase.from("mileage").insert(data.mileage.map(M.mileageToRow)),
  ]);
  emitDataChange();
}

/** Wipe the user's data and reseed the default categories + settings. */
export async function resetAll(): Promise<void> {
  const uid = await currentUserId();
  if (!uid) throw new Error("Not signed in");
  await clearUserData(uid);
  await supabase.from("categories").insert(DEFAULT_CATEGORIES.map((c, i) => M.categoryToRow({ ...c, id: crypto.randomUUID() }, i)));
  await supabase.from("settings").upsert({ user_id: uid, ...M.settingsToRow(DEFAULT_SETTINGS) });
  emitDataChange();
}

function throwOn(res: { error: unknown }): void {
  if (res.error) throw res.error;
}
