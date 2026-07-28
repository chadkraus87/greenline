import { db } from "./db";
import type { AppData, Settings, Category } from "../types";
import { validateImport } from "../lib/backup";

export const DEFAULT_SETTINGS: Settings = { theme: "dark", clock24: false, startBalance: 0 };

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

/** Seed defaults on first run. */
export async function ensureSeeded(): Promise<void> {
  const n = await db.categories.count();
  if (n === 0) await db.categories.bulkAdd(DEFAULT_CATEGORIES);
  const s = await db.kv.get("settings");
  if (!s) await db.kv.put({ key: "settings", value: DEFAULT_SETTINGS });
}

export async function getSettings(): Promise<Settings> {
  const row = await db.kv.get("settings");
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<Settings>) ?? {}) };
}
export async function patchSettings(patch: Partial<Settings>): Promise<void> {
  const cur = await getSettings();
  await db.kv.put({ key: "settings", value: { ...cur, ...patch } });
}

export async function exportAll(): Promise<AppData> {
  const [settings, categories, incomes, bills, expenses, goals, events] = await Promise.all([
    getSettings(), db.categories.toArray(), db.incomes.toArray(), db.bills.toArray(),
    db.expenses.toArray(), db.goals.toArray(), db.events.toArray(),
  ]);
  return { settings, categories, incomes, bills, expenses, goals, events };
}

/** Validates, then atomically replaces the whole database. Throws (leaving data intact) on invalid input. */
export async function importAll(raw: unknown): Promise<void> {
  const data = validateImport(raw);
  await db.transaction("rw", [db.categories, db.incomes, db.bills, db.expenses, db.goals, db.events, db.kv], async () => {
    await Promise.all([
      db.categories.clear(), db.incomes.clear(), db.bills.clear(),
      db.expenses.clear(), db.goals.clear(), db.events.clear(),
    ]);
    await Promise.all([
      db.categories.bulkAdd(data.categories), db.incomes.bulkAdd(data.incomes),
      db.bills.bulkAdd(data.bills), db.expenses.bulkAdd(data.expenses),
      db.goals.bulkAdd(data.goals), db.events.bulkAdd(data.events),
      db.kv.put({ key: "settings", value: data.settings }),
    ]);
  });
}

export async function resetAll(): Promise<void> {
  await db.transaction("rw", [db.categories, db.incomes, db.bills, db.expenses, db.goals, db.events, db.kv], async () => {
    await Promise.all([
      db.categories.clear(), db.incomes.clear(), db.bills.clear(),
      db.expenses.clear(), db.goals.clear(), db.events.clear(), db.kv.clear(),
    ]);
  });
  await ensureSeeded();
}
