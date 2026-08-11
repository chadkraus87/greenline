import type { AppData, Expense, Mileage } from "../types";
import { round2 } from "./money";

/**
 * Self-employment tax helpers for sole proprietors (Schedule C).
 *
 * These produce *estimates for planning*, not tax advice or a filed return.
 * Anything here should be reviewed by a tax professional before filing.
 */

export interface TaxLine {
  id: string;
  /** Schedule C line reference, for handing to a preparer. */
  line: string;
  label: string;
  /** Portion of a qualifying expense that is deductible. Meals are the odd one out. */
  deductiblePct: number;
  hint?: string;
}

/** Schedule C Part II expense lines, trimmed to what a trainer or contractor actually uses. */
export const SCHEDULE_C: TaxLine[] = [
  { id: "advertising", line: "8", label: "Advertising", deductiblePct: 100, hint: "Website, ads, flyers, promo" },
  { id: "car", line: "9", label: "Car & truck", deductiblePct: 100, hint: "Actual vehicle costs — not used if you claim standard mileage" },
  { id: "commissions", line: "10", label: "Commissions & fees", deductiblePct: 100 },
  { id: "contract_labor", line: "11", label: "Contract labor", deductiblePct: 100, hint: "Subcontractors — a 1099-NEC may be required" },
  { id: "depreciation", line: "13", label: "Depreciation & Section 179", deductiblePct: 100, hint: "Equipment placed in service" },
  { id: "insurance", line: "15", label: "Insurance (not health)", deductiblePct: 100, hint: "Liability, business property" },
  { id: "interest", line: "16b", label: "Interest (other)", deductiblePct: 100, hint: "Business loan or card interest" },
  { id: "legal", line: "17", label: "Legal & professional", deductiblePct: 100, hint: "Accountant, attorney, bookkeeping" },
  { id: "office", line: "18", label: "Office expense", deductiblePct: 100, hint: "Software, postage, stationery" },
  { id: "rent_equipment", line: "20a", label: "Rent — vehicles & equipment", deductiblePct: 100 },
  { id: "rent_property", line: "20b", label: "Rent — business property", deductiblePct: 100, hint: "Gym or shop space" },
  { id: "repairs", line: "21", label: "Repairs & maintenance", deductiblePct: 100 },
  { id: "supplies", line: "22", label: "Supplies", deductiblePct: 100, hint: "Materials, small tools, training gear" },
  { id: "taxes_licenses", line: "23", label: "Taxes & licenses", deductiblePct: 100, hint: "Business license, certifications" },
  { id: "travel", line: "24a", label: "Travel", deductiblePct: 100, hint: "Lodging, airfare for business trips" },
  { id: "meals", line: "24b", label: "Business meals", deductiblePct: 50, hint: "Generally 50% deductible" },
  { id: "utilities", line: "25", label: "Utilities", deductiblePct: 100 },
  { id: "wages", line: "26", label: "Wages", deductiblePct: 100, hint: "W-2 employees" },
  { id: "other", line: "27a", label: "Other expenses", deductiblePct: 100 },
];

export const TAX_LINE_BY_ID = new Map(SCHEDULE_C.map((l) => [l.id, l]));

/**
 * Deductible portion of one expense:
 *   amount × business-use % × the line's own deductible %
 * A $100 client lunch at 100% business use deducts $50 (meals are 50%).
 */
export function deductibleAmount(e: Expense): number {
  if (!e.business) return 0;
  const usePct = e.businessPct === undefined ? 100 : Math.max(0, Math.min(100, e.businessPct));
  const line = e.taxCategory ? TAX_LINE_BY_ID.get(e.taxCategory) : undefined;
  const linePct = line?.deductiblePct ?? 100;
  return round2((e.amount * usePct / 100) * linePct / 100);
}

export interface TaxLineTotal { id: string; line: string; label: string; gross: number; deductible: number; count: number; }

export interface TaxSummary {
  year: number;
  businessIncome: number;
  /** Expense totals grouped by Schedule C line, deductible amounts only. */
  lines: TaxLineTotal[];
  uncategorized: { gross: number; count: number };
  miles: number;
  mileageDeduction: number;
  totalDeductions: number;
  netProfit: number;
  /** Rough SE tax estimate — see seTaxEstimate() for its limits. */
  selfEmploymentTax: number;
  /** Expenses flagged business but missing a Schedule C line. */
  needsReview: number;
}

/**
 * Rough self-employment tax: 15.3% of 92.35% of net profit.
 *
 * Ignores the Social Security wage base cap (above which the rate drops to
 * 2.9%), other household income, and the deduction for half of SE tax. It is a
 * set-aside planning figure, not a computed liability.
 */
export function seTaxEstimate(netProfit: number): number {
  if (netProfit <= 0) return 0;
  return round2(netProfit * 0.9235 * 0.153);
}

/** Year-to-date Schedule C picture for one calendar year. */
export function taxSummary(data: AppData, year: number): TaxSummary {
  const inYear = (d: string) => d.startsWith(String(year));

  const businessIncome = round2(
    data.incomes.filter((i) => i.business)
      .reduce((s, i) => {
        // Count payments actually marked received in this year.
        const received = Object.entries(i.received ?? {}).filter(([d, got]) => got && inYear(d));
        return s + received.length * i.amount;
      }, 0)
  );

  const businessExpenses = data.expenses.filter((e) => e.business && inYear(e.date));

  const totals = new Map<string, TaxLineTotal>();
  let uncatGross = 0, uncatCount = 0, needsReview = 0;

  for (const e of businessExpenses) {
    if (!e.taxCategory || !TAX_LINE_BY_ID.has(e.taxCategory)) {
      uncatGross = round2(uncatGross + e.amount);
      uncatCount++;
      needsReview++;
      continue;
    }
    const line = TAX_LINE_BY_ID.get(e.taxCategory)!;
    const cur = totals.get(line.id) ?? { id: line.id, line: line.line, label: line.label, gross: 0, deductible: 0, count: 0 };
    cur.gross = round2(cur.gross + e.amount);
    cur.deductible = round2(cur.deductible + deductibleAmount(e));
    cur.count++;
    totals.set(line.id, cur);
  }

  const miles = round2((data.mileage ?? []).filter((m) => inYear(m.date)).reduce((s, m) => s + m.miles, 0));
  const mileageDeduction = round2(miles * (data.settings.mileageRate || 0));

  const lines = [...totals.values()].sort((a, b) => b.deductible - a.deductible);
  const expenseDeductions = round2(lines.reduce((s, l) => s + l.deductible, 0));
  const totalDeductions = round2(expenseDeductions + mileageDeduction);
  const netProfit = round2(businessIncome - totalDeductions);

  return {
    year, businessIncome, lines,
    uncategorized: { gross: uncatGross, count: uncatCount },
    miles, mileageDeduction, totalDeductions, netProfit,
    selfEmploymentTax: seTaxEstimate(netProfit),
    needsReview,
  };
}

/** Federal estimated-tax due dates for a tax year (moves to the next business day in practice). */
export function quarterlyDueDates(year: number): { label: string; due: string; covers: string }[] {
  return [
    { label: "Q1", due: `${year}-04-15`, covers: "Jan 1 – Mar 31" },
    { label: "Q2", due: `${year}-06-15`, covers: "Apr 1 – May 31" },
    { label: "Q3", due: `${year}-09-15`, covers: "Jun 1 – Aug 31" },
    { label: "Q4", due: `${year + 1}-01-15`, covers: "Sep 1 – Dec 31" },
  ];
}

/** CSV of the mileage log — the substantiation the IRS asks for. */
export function mileageCsvRows(entries: Mileage[], rate: number): (string | number)[][] {
  const rows: (string | number)[][] = [["Date", "Miles", "Purpose", "From", "To", "Rate", "Deduction"]];
  for (const m of [...entries].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([m.date, m.miles, m.purpose, m.from ?? "", m.to ?? "", rate.toFixed(3), (m.miles * rate).toFixed(2)]);
  }
  return rows;
}
