import { round2 } from "./money";
import type { Expense } from "../types";

/**
 * Bank / credit-card CSV import.
 *
 * Every bank exports a different shape, so nothing here is hardcoded to one
 * institution: we parse generically, guess the column roles, and let the user
 * correct the guess before anything is written.
 */

// --- Parsing -------------------------------------------------------------

/** RFC-4180 parser: honours quoted fields, escaped quotes, and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, ""); // strip BOM
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === ",") { row.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; continue; }
    field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  // Drop trailing blank lines.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

// --- Field coercion ------------------------------------------------------

/** Handles "$1,234.56", "(12.34)" (accounting negative), "-12.34", "1 234,56". */
export function parseAmount(raw: string): number | null {
  let s = (raw ?? "").trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[$£€\s]/g, "");
  // European "1.234,56" → "1234.56" (comma is the decimal separator).
  if (/,\d{1,2}$/.test(s) && /\./.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }
  if (s.startsWith("+")) s = s.slice(1);
  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -round2(n) : round2(n);
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Accepts YYYY-MM-DD, MM/DD/YYYY, M/D/YY, and DD-MMM-YYYY.
 * Ambiguous slash dates are read US-style (month first) — the preview shows the
 * parsed result so a misread is visible before importing.
 */
export function parseDate(raw: string): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;

  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let [, a, b, y] = m;
    let year = +y;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    let month = +a, day = +b;
    // If the first number can't be a month, it must be day-first.
    if (month > 12 && day <= 12) { const t = month; month = day; day = t; }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  const MONTHS = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{2,4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase());
    if (mi === -1) return null;
    let year = +m[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return `${year}-${pad(mi + 1)}-${pad(+m[1])}`;
  }
  return null;
}

// --- Column detection ----------------------------------------------------

export interface ColumnMap {
  date: number;
  description: number;
  /** Single signed column. -1 when the file splits debit/credit instead. */
  amount: number;
  debit: number;
  credit: number;
}

const findCol = (headers: string[], patterns: RegExp[]): number => {
  for (const p of patterns) {
    const i = headers.findIndex((h) => p.test(h.trim().toLowerCase()));
    if (i !== -1) return i;
  }
  return -1;
};

/** Best-guess column roles from the header row. */
export function detectColumns(headers: string[]): ColumnMap {
  const debit = findCol(headers, [/^debit$/, /debit amount/, /withdrawal/, /^charges?$/]);
  const credit = findCol(headers, [/^credit$/, /credit amount/, /^deposits?$/, /^payments?$/]);
  return {
    date: findCol(headers, [/transaction date/, /posted? date/, /^date$/, /date/]),
    description: findCol(headers, [/description/, /^payee$/, /merchant/, /^name$/, /memo/, /details/]),
    // Prefer a single signed column; ignore it if the file is debit/credit split.
    amount: debit !== -1 && credit !== -1 ? -1 : findCol(headers, [/^amount$/, /amount/, /^value$/]),
    debit, credit,
  };
}

/** True when the header row looks like labels rather than data. */
export function looksLikeHeader(row: string[]): boolean {
  const nonEmpty = row.filter((c) => c.trim() !== "");
  if (nonEmpty.length < 2) return false;
  const numeric = nonEmpty.filter((c) => parseAmount(c) !== null).length;
  const dated = nonEmpty.filter((c) => parseDate(c) !== null).length;
  return numeric === 0 && dated === 0;
}

// --- Row building --------------------------------------------------------

export interface ImportRow {
  index: number;
  date: string;
  description: string;
  /** Positive = money spent. Sign normalisation already applied. */
  amount: number;
  /** Money in (refund, payment, deposit) — excluded from expense import. */
  isCredit: boolean;
  duplicate: boolean;
  include: boolean;
  error?: string;
}

export interface BuildOptions {
  /** Set when the file marks purchases as positive numbers in a single column. */
  purchasesArePositive?: boolean;
}

/**
 * Turns raw rows into reviewable transactions. Rows that fail to parse are kept
 * with an `error` so the user can see what was skipped rather than losing it silently.
 */
export function buildRows(dataRows: string[][], map: ColumnMap, opts: BuildOptions = {}): ImportRow[] {
  const out: ImportRow[] = [];
  const cell = (r: string[], i: number) => (i >= 0 && i < r.length ? r[i] : "");

  dataRows.forEach((r, index) => {
    const date = parseDate(cell(r, map.date));
    const description = cell(r, map.description).trim();

    let signed: number | null = null;
    if (map.amount >= 0) {
      const a = parseAmount(cell(r, map.amount));
      if (a !== null) signed = opts.purchasesArePositive ? -a : a;
    } else {
      const d = parseAmount(cell(r, map.debit));
      const c = parseAmount(cell(r, map.credit));
      // Debit column = money out; credit = money in.
      if (d !== null && d !== 0) signed = -Math.abs(d);
      else if (c !== null && c !== 0) signed = Math.abs(c);
    }

    const base = { index, date: date ?? "", description, duplicate: false };
    if (!date) { out.push({ ...base, amount: 0, isCredit: false, include: false, error: "Unreadable date" }); return; }
    if (signed === null) { out.push({ ...base, amount: 0, isCredit: false, include: false, error: "Unreadable amount" }); return; }
    if (signed === 0) { out.push({ ...base, amount: 0, isCredit: false, include: false, error: "Zero amount" }); return; }

    const isCredit = signed > 0;
    out.push({
      ...base,
      amount: round2(Math.abs(signed)),
      isCredit,
      // Credits are money coming in, not expenses — off by default.
      include: !isCredit,
    });
  });

  return out;
}

/** Converts scanned statement transactions into the same review rows CSV produces. */
export function rowsFromTransactions(
  txns: { date: string; description: string; amount: number; direction: "debit" | "credit" }[],
): ImportRow[] {
  return txns.map((t, index) => {
    const date = parseDate(t.date);
    const amount = Math.abs(Number(t.amount) || 0);
    const base = { index, date: date ?? "", description: (t.description ?? "").trim(), duplicate: false };
    if (!date) return { ...base, amount: 0, isCredit: false, include: false, error: "Unreadable date" };
    if (!amount) return { ...base, amount: 0, isCredit: false, include: false, error: "Zero amount" };
    const isCredit = t.direction === "credit";
    return { ...base, amount: round2(amount), isCredit, include: !isCredit };
  });
}

// --- Duplicate detection -------------------------------------------------

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Marks rows already present as an expense (same date, amount, and similar title). */
export function markDuplicates(rows: ImportRow[], existing: Expense[]): ImportRow[] {
  const seen = new Set(existing.map((e) => `${e.date}|${e.amount.toFixed(2)}|${normalize(e.merchant || e.title)}`));
  const withinBatch = new Set<string>();

  return rows.map((r) => {
    if (r.error) return r;
    const key = `${r.date}|${r.amount.toFixed(2)}|${normalize(r.description)}`;
    const dupe = seen.has(key) || withinBatch.has(key);
    withinBatch.add(key);
    return dupe ? { ...r, duplicate: true, include: false } : r;
  });
}

/** Tidies bank descriptions: strips reference noise and collapses whitespace. */
export function cleanDescription(s: string): string {
  return s
    .replace(/\b(?:pos|ach|debit|credit|purchase|payment)\b[\s#:-]*/gi, " ")
    .replace(/\s*#?\d{6,}\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim() || s.trim();
}
