import type { AppData, Expense } from "../types";
import { round2 } from "./money";
import { taxSummary, TAX_LINE_BY_ID, type TaxLineTotal } from "./tax";

/**
 * Pre-filing checks and year-over-year comparison.
 *
 * The goal is to surface the gaps a preparer would otherwise find for you:
 * missing categories, missing substantiation, income never marked received.
 */

export type IssueLevel = "blocker" | "warning" | "info";

export interface ReadinessIssue {
  id: string;
  level: IssueLevel;
  title: string;
  detail: string;
  count: number;
  amount?: number;
  /** Where to go to fix it. */
  fix: string;
}

/** Amount above which a written receipt is conventionally expected. */
export const RECEIPT_THRESHOLD = 75;

export interface Readiness {
  year: number;
  issues: ReadinessIssue[];
  /** 0–100. 100 means nothing outstanding. */
  score: number;
  ready: boolean;
}

export function taxReadiness(data: AppData, year: number, unfiledReceipts = 0): Readiness {
  const inYear = (d: string) => d.startsWith(String(year));
  const businessExpenses = data.expenses.filter((e) => e.business && inYear(e.date));
  const issues: ReadinessIssue[] = [];

  // 1. Business spend with no Schedule C line — silently excluded from deductions.
  const uncategorized = businessExpenses.filter((e) => !e.taxCategory || !TAX_LINE_BY_ID.has(e.taxCategory));
  if (uncategorized.length > 0) {
    issues.push({
      id: "uncategorized",
      level: "blocker",
      title: "Business expenses with no tax category",
      detail: "These are excluded from your deductions until you assign a Schedule C line.",
      count: uncategorized.length,
      amount: round2(uncategorized.reduce((s, e) => s + e.amount, 0)),
      fix: "Expenses tab — open each and pick a Schedule C category",
    });
  }

  // 2. Larger business expenses with no receipt on file.
  const noReceipt = businessExpenses.filter((e) => e.amount >= RECEIPT_THRESHOLD && !e.receiptPath);
  if (noReceipt.length > 0) {
    issues.push({
      id: "missing-receipts",
      level: "warning",
      title: `Business expenses over $${RECEIPT_THRESHOLD} with no receipt`,
      detail: "Documentation is generally expected above this amount. Scan or attach one where you can.",
      count: noReceipt.length,
      amount: round2(noReceipt.reduce((s, e) => s + e.amount, 0)),
      fix: "Receipts tab — scan and file, or attach to the expense",
    });
  }

  // 3. Receipts scanned but never attached to anything.
  if (unfiledReceipts > 0) {
    issues.push({
      id: "unfiled",
      level: "warning",
      title: "Unfiled receipts",
      detail: "Scanned but not attached to an expense, so they're absent from your records and the tax package.",
      count: unfiledReceipts,
      fix: "Receipts tab — File it",
    });
  }

  // 4. Business income sources with nothing marked received this year.
  const silentIncome = data.incomes.filter(
    (i) => i.business && !Object.entries(i.received ?? {}).some(([d, got]) => got && inYear(d))
  );
  if (silentIncome.length > 0) {
    issues.push({
      id: "income-unmarked",
      level: "blocker",
      title: "Business income with no payments marked received",
      detail: "Income is counted when you mark a payment received. Unmarked payments are missing from the return.",
      count: silentIncome.length,
      fix: "Income tab — tick the payments you actually received",
    });
  }

  // 5. Business activity but no mileage at all — often simply forgotten.
  const anyMileage = data.mileage.some((m) => inYear(m.date));
  if (businessExpenses.length > 0 && !anyMileage) {
    issues.push({
      id: "no-mileage",
      level: "info",
      title: "No business mileage logged this year",
      detail: "If you drove for work, this is usually the largest single deduction — and the easiest to lose.",
      count: 0,
      fix: "Mileage tab — log trips",
    });
  }

  // 6. Personal expenses sitting in obviously business-looking categories are
  //    not something we can detect reliably, so we don't guess. Instead: flag
  //    when nothing at all is tagged business, which usually means it wasn't set up.
  if (data.settings.businessMode && businessExpenses.length === 0) {
    issues.push({
      id: "nothing-tagged",
      level: "info",
      title: "Nothing tagged as a business expense yet",
      detail: "Self-employment mode is on, but no expenses are marked business for this year.",
      count: 0,
      fix: "Expenses tab — tick “Business expense” where it applies",
    });
  }

  const blockers = issues.filter((i) => i.level === "blocker").length;
  const warnings = issues.filter((i) => i.level === "warning").length;
  const score = Math.max(0, 100 - blockers * 30 - warnings * 12);

  return { year, issues, score, ready: blockers === 0 && warnings === 0 };
}

// --- Year-over-year -------------------------------------------------------

export interface LineComparison {
  id: string; line: string; label: string;
  current: number; prior: number; delta: number;
  /** Percentage change; null when there's no prior-year base to compare against. */
  changePct: number | null;
}

export interface YearComparison {
  year: number;
  income: { current: number; prior: number; delta: number };
  deductions: { current: number; prior: number; delta: number };
  netProfit: { current: number; prior: number; delta: number };
  lines: LineComparison[];
  /** Lines claimed last year but nothing this year — often an oversight. */
  droppedLines: LineComparison[];
}

export function compareYears(data: AppData, year: number): YearComparison {
  const cur = taxSummary(data, year);
  const prev = taxSummary(data, year - 1);

  const byId = (rows: TaxLineTotal[]) => new Map(rows.map((l) => [l.id, l]));
  const c = byId(cur.lines);
  const p = byId(prev.lines);

  const ids = [...new Set([...c.keys(), ...p.keys()])];
  const lines: LineComparison[] = ids.map((id) => {
    const cv = c.get(id)?.deductible ?? 0;
    const pv = p.get(id)?.deductible ?? 0;
    const meta = c.get(id) ?? p.get(id)!;
    return {
      id, line: meta.line, label: meta.label,
      current: cv, prior: pv, delta: round2(cv - pv),
      changePct: pv > 0 ? Math.round(((cv - pv) / pv) * 100) : null,
    };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    year,
    income: { current: cur.businessIncome, prior: prev.businessIncome, delta: round2(cur.businessIncome - prev.businessIncome) },
    deductions: { current: cur.totalDeductions, prior: prev.totalDeductions, delta: round2(cur.totalDeductions - prev.totalDeductions) },
    netProfit: { current: cur.netProfit, prior: prev.netProfit, delta: round2(cur.netProfit - prev.netProfit) },
    lines,
    droppedLines: lines.filter((l) => l.prior > 0 && l.current === 0),
  };
}

// --- Retention ------------------------------------------------------------

export interface RetentionGroup {
  year: string;
  personal: { count: number; paths: string[] };
  business: { count: number; paths: string[] };
}

/**
 * Groups stored receipts by year so old ones can be reviewed for deletion.
 * Nothing is ever deleted automatically — business receipts substantiate a
 * filed return and are conventionally kept for several years.
 */
export function retentionGroups(expenses: Expense[]): RetentionGroup[] {
  const map = new Map<string, RetentionGroup>();
  for (const e of expenses) {
    if (!e.receiptPath) continue;
    const year = e.date.slice(0, 4);
    const g = map.get(year) ?? { year, personal: { count: 0, paths: [] }, business: { count: 0, paths: [] } };
    const bucket = e.business ? g.business : g.personal;
    bucket.count++;
    bucket.paths.push(e.receiptPath);
    map.set(year, g);
  }
  return [...map.values()].sort((a, b) => b.year.localeCompare(a.year));
}
