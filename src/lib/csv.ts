import type { AppData } from "../types";

/** RFC-4180-safe CSV cell that also blocks spreadsheet formula injection.
 *  Cells starting with = + - @ (or tab/CR) are prefixed with ' so Excel/Sheets
 *  treat them as text, never as executable formulas. */
const esc = (v: unknown): string => {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows: (string | number)[][]): string =>
  rows.map((r) => r.map(esc).join(",")).join("\r\n");

const catName = (data: AppData, id: string): string =>
  data.categories.find((c) => c.id === id)?.name ?? "";

/** Every logged expense — the tax-relevant record. Sorted oldest → newest. */
export function expensesCsv(data: AppData): string {
  const rows: (string | number)[][] = [["Date", "Title", "Category", "Merchant", "Amount", "Notes"]];
  for (const e of [...data.expenses].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([e.date, e.title, catName(data, e.categoryId), e.merchant ?? "", e.amount.toFixed(2), e.notes ?? ""]);
  }
  return toCsv(rows);
}

/** Recurring bills with annualized cost — supports the subscription/creep audit. */
export function billsCsv(data: AppData): string {
  const rows: (string | number)[][] = [["Bill", "Category", "Amount (monthly)", "Annualized", "Due day", "Priority", "Paused"]];
  for (const b of [...data.bills].sort((a, b) => b.amount - a.amount)) {
    rows.push([b.name, catName(data, b.categoryId), b.amount.toFixed(2), (b.amount * 12).toFixed(2), b.dueDay, b.priority, b.paused ? "yes" : "no"]);
  }
  return toCsv(rows);
}
