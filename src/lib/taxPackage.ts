import type { AppData } from "../types";
import { toCsv } from "./csv";
import { taxSummary, deductibleAmount, TAX_LINE_BY_ID, quarterlyDueDates } from "./tax";
import { safeName } from "./zip";

/**
 * Builds the year-end package handed to a tax preparer: a summary, a fully
 * itemized transaction list, income detail, the mileage log, and a README that
 * states the method and its limits. Receipt images are added separately by the
 * caller (they require network fetches).
 */

export interface PackageFile { name: string; content: string; }

const cat = (data: AppData, id: string) => data.categories.find((c) => c.id === id)?.name ?? "";

/** Stable, collision-free file name for a receipt image inside the archive. */
export function receiptFileName(date: string, merchant: string, id: string, path: string): string {
  const ext = (path.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  return `${date}_${safeName(merchant || "receipt", "receipt")}_${id.slice(0, 8)}.${ext}`;
}

export function buildTaxPackage(data: AppData, year: number): PackageFile[] {
  const s = taxSummary(data, year);
  const inYear = (d: string) => d.startsWith(String(year));
  const bizName = data.settings.businessName?.trim() || "Self-employment";

  const businessExpenses = data.expenses
    .filter((e) => e.business && inYear(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  const mileage = data.mileage.filter((m) => inYear(m.date)).sort((a, b) => a.date.localeCompare(b.date));

  // --- README -------------------------------------------------------------
  const readme = [
    `GREENLINE TAX PACKAGE — ${year}`,
    `Business: ${bizName}`,
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
    "CONTENTS",
    "  01-summary.csv            Totals by Schedule C line, net profit, SE tax estimate",
    "  02-expenses-itemized.csv  Every business expense, dated and categorized",
    "  03-income.csv             Business income by payment received",
    "  04-mileage.csv            Trip log (date, miles, purpose)",
    "  receipts/                 Scanned receipt images, named to match column",
    "                            'Receipt file' in 02-expenses-itemized.csv",
    "",
    "METHOD",
    "  Accounting basis: CASH (income counted when received, expenses when paid).",
    "  Deductible amount = amount x business-use % x the Schedule C line's own",
    "  deductible %. Meals are treated as 50% deductible; all other lines 100%.",
    `  Mileage uses the standard rate of $${data.settings.mileageRate.toFixed(3)}/mile,`,
    "  set by the taxpayer. Standard mileage and actual vehicle costs are mutually",
    "  exclusive — if mileage is claimed, vehicle operating costs should not also",
    "  be deducted on line 9.",
    "",
    "LIMITS — PLEASE REVIEW",
    "  * The self-employment tax figure is a planning estimate only: a flat 15.3%",
    "    of 92.35% of net profit. It ignores the Social Security wage base cap,",
    "    other household income, and the deduction for one-half of SE tax.",
    "  * No depreciation schedule, home-office calculation, or vehicle basis",
    "    tracking is included.",
    "  * Figures are produced by budgeting software, not by an accountant, and are",
    "    not tax advice or a filed return.",
    s.needsReview > 0
      ? `  * ${s.needsReview} business expense(s) totalling ${s.uncategorized.gross.toFixed(2)} have no\n    Schedule C category and are EXCLUDED from the deduction totals. They are\n    listed in 02-expenses-itemized.csv with a blank Schedule C line.`
      : "  * All business expenses carry a Schedule C category.",
    "",
    "ESTIMATED TAX DUE DATES",
    ...quarterlyDueDates(year).map((q) => `  ${q.label}  ${q.due}   covers ${q.covers}`),
    "",
  ].join("\n");

  // --- Summary ------------------------------------------------------------
  const summary: (string | number)[][] = [
    ["Greenline tax summary", year],
    ["Business", bizName],
    ["Basis", "Cash"],
    [],
    ["Business income received", s.businessIncome.toFixed(2)],
    [],
    ["Schedule C line", "Category", "Amount spent", "Deductible", "Transactions"],
    ...s.lines.map((l) => [l.line, l.label, l.gross.toFixed(2), l.deductible.toFixed(2), l.count]),
  ];
  if (s.miles > 0) summary.push(["9", "Vehicle — standard mileage", "", s.mileageDeduction.toFixed(2), mileage.length]);
  if (s.uncategorized.count > 0) {
    summary.push([], ["UNCATEGORIZED (excluded from deductions)", "", s.uncategorized.gross.toFixed(2), "0.00", s.uncategorized.count]);
  }
  summary.push(
    [],
    ["Total deductions", s.totalDeductions.toFixed(2)],
    ["Net profit (income - deductions)", s.netProfit.toFixed(2)],
    ["Estimated self-employment tax", s.selfEmploymentTax.toFixed(2)],
    [],
    ["NOTE", "Planning estimates from budgeting software. Not tax advice or a filed return."],
  );

  // --- Itemized expenses --------------------------------------------------
  const itemized: (string | number)[][] = [[
    "Date", "Merchant", "Description", "Spending category", "Schedule C line",
    "Schedule C category", "Amount", "Business use %", "Deductible", "Receipt file", "Notes",
  ]];
  for (const e of businessExpenses) {
    const line = e.taxCategory ? TAX_LINE_BY_ID.get(e.taxCategory) : undefined;
    itemized.push([
      e.date,
      e.merchant ?? "",
      e.title,
      cat(data, e.categoryId),
      line?.line ?? "",
      line?.label ?? "UNCATEGORIZED",
      e.amount.toFixed(2),
      (e.businessPct ?? 100).toString(),
      deductibleAmount(e).toFixed(2),
      e.receiptPath ? `receipts/${receiptFileName(e.date, e.merchant || e.title, e.id, e.receiptPath)}` : "",
      e.notes ?? "",
    ]);
  }
  itemized.push([]);
  itemized.push(["", "", "", "", "", "TOTAL",
    businessExpenses.reduce((t, e) => t + e.amount, 0).toFixed(2), "",
    businessExpenses.reduce((t, e) => t + deductibleAmount(e), 0).toFixed(2), "", ""]);

  // --- Income -------------------------------------------------------------
  const income: (string | number)[][] = [["Date received", "Source", "Amount", "Type"]];
  for (const i of data.incomes.filter((x) => x.business)) {
    for (const [d, got] of Object.entries(i.received ?? {})) {
      if (got && inYear(d)) income.push([d, i.name, i.amount.toFixed(2), "Self-employment (1099 / direct)"]);
    }
  }
  income.sort((a, b) => (a[0] === "Date received" ? -1 : String(a[0]).localeCompare(String(b[0]))));
  income.push([], ["TOTAL", "", s.businessIncome.toFixed(2), ""]);

  // --- Mileage ------------------------------------------------------------
  const rate = data.settings.mileageRate;
  const mileageRows: (string | number)[][] = [["Date", "Miles", "Business purpose", "From", "To", "Rate", "Deduction"]];
  for (const m of mileage) {
    mileageRows.push([m.date, m.miles, m.purpose, m.from ?? "", m.to ?? "", rate.toFixed(3), (m.miles * rate).toFixed(2)]);
  }
  mileageRows.push([], ["TOTAL", s.miles, "", "", "", "", s.mileageDeduction.toFixed(2)]);

  return [
    { name: "00-README.txt", content: readme },
    { name: "01-summary.csv", content: toCsv(summary) },
    { name: "02-expenses-itemized.csv", content: toCsv(itemized) },
    { name: "03-income.csv", content: toCsv(income) },
    { name: "04-mileage.csv", content: toCsv(mileageRows) },
  ];
}

/** Business expenses in the year that have a stored receipt, with their archive names. */
export function receiptManifest(data: AppData, year: number): { path: string; name: string }[] {
  return data.expenses
    .filter((e) => e.business && e.receiptPath && e.date.startsWith(String(year)))
    .map((e) => ({
      path: e.receiptPath!,
      name: `receipts/${receiptFileName(e.date, e.merchant || e.title, e.id, e.receiptPath!)}`,
    }));
}
