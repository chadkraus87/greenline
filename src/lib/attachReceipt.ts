import type { Expense } from "../types";

const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

/**
 * Expenses a stray receipt could belong to, most likely first.
 *
 * Only expenses without a receipt are offered — attaching would otherwise
 * silently orphan the image already there. Receipts are usually photographed
 * within a few days of the purchase, so closeness to the upload date ranks
 * first; the query matches merchant, title, notes or the amount as typed.
 */
export function rankAttachCandidates(expenses: Expense[], nearDate: string | null, query = ""): Expense[] {
  const q = query.trim().toLowerCase().replace(/^\$/, "");
  const near = nearDate && /^\d{4}-\d{2}-\d{2}/.test(nearDate) ? dayNumber(nearDate.slice(0, 10)) : null;

  return expenses
    .filter((e) => !e.receiptPath)
    .filter((e) => !q || `${e.merchant ?? ""} ${e.title} ${e.notes ?? ""} ${e.amount.toFixed(2)}`.toLowerCase().includes(q))
    .map((e) => ({ e, gap: near === null ? 0 : Math.abs(dayNumber(e.date) - near) }))
    .sort((a, b) => a.gap - b.gap || b.e.date.localeCompare(a.e.date))
    .map((x) => x.e);
}
