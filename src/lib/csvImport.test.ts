import { describe, it, expect } from "vitest";
import {
  parseCsv, parseAmount, parseDate, detectColumns, looksLikeHeader,
  buildRows, markDuplicates, cleanDescription,
} from "./csvImport";
import type { Expense } from "../types";

describe("parseCsv", () => {
  it("handles quoted fields, escaped quotes, and embedded commas", () => {
    const csv = 'Date,Description,Amount\n2026-08-01,"ACME, INC","-12.34"\n2026-08-02,"He said ""hi""",5\n';
    expect(parseCsv(csv)).toEqual([
      ["Date", "Description", "Amount"],
      ["2026-08-01", "ACME, INC", "-12.34"],
      ["2026-08-02", 'He said "hi"', "5"],
    ]);
  });
  it("handles newlines inside quoted fields", () => {
    expect(parseCsv('a,b\n"line\nbreak",2\n')).toEqual([["a", "b"], ["line\nbreak", "2"]]);
  });
  it("strips a BOM, CRLF endings, and trailing blank lines", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("parseAmount", () => {
  it("reads plain, signed, currency-marked, and thousands-separated values", () => {
    expect(parseAmount("12.34")).toBe(12.34);
    expect(parseAmount("-12.34")).toBe(-12.34);
    expect(parseAmount("$1,234.56")).toBe(1234.56);
    expect(parseAmount("+5")).toBe(5);
  });
  it("treats parentheses as negative (accounting style)", () => {
    expect(parseAmount("(12.34)")).toBe(-12.34);
    expect(parseAmount("($1,000.00)")).toBe(-1000);
  });
  it("reads European decimal commas", () => {
    expect(parseAmount("1.234,56")).toBe(1234.56);
  });
  it("rejects junk rather than guessing", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("N/A")).toBeNull();
    expect(parseAmount("--")).toBeNull();
  });
});

describe("parseDate", () => {
  it("reads ISO, US slash, and short-year formats", () => {
    expect(parseDate("2026-08-04")).toBe("2026-08-04");
    expect(parseDate("08/04/2026")).toBe("2026-08-04");
    expect(parseDate("8/4/26")).toBe("2026-08-04");
  });
  it("falls back to day-first when the first number can't be a month", () => {
    expect(parseDate("25/12/2026")).toBe("2026-12-25");
  });
  it("reads DD-MMM-YYYY", () => {
    expect(parseDate("04-Aug-2026")).toBe("2026-08-04");
  });
  it("rejects unparseable input", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("not a date")).toBeNull();
    expect(parseDate("13/45/2026")).toBeNull();
  });
});

describe("detectColumns", () => {
  it("finds a single signed amount column", () => {
    const m = detectColumns(["Transaction Date", "Description", "Amount"]);
    expect(m).toMatchObject({ date: 0, description: 1, amount: 2, debit: -1, credit: -1 });
  });
  it("prefers debit/credit split over a signed column when both exist", () => {
    const m = detectColumns(["Date", "Payee", "Debit", "Credit"]);
    expect(m.amount).toBe(-1);
    expect(m.debit).toBe(2);
    expect(m.credit).toBe(3);
  });
  it("returns -1 for columns it can't find", () => {
    expect(detectColumns(["foo", "bar"]).date).toBe(-1);
  });
});

describe("looksLikeHeader", () => {
  it("recognises a label row and rejects a data row", () => {
    expect(looksLikeHeader(["Date", "Description", "Amount"])).toBe(true);
    expect(looksLikeHeader(["2026-08-01", "ACME", "-12.34"])).toBe(false);
  });
});

describe("buildRows", () => {
  const map = { date: 0, description: 1, amount: 2, debit: -1, credit: -1 };

  it("treats negative amounts as spending and includes them", () => {
    const [r] = buildRows([["2026-08-01", "Coffee", "-4.50"]], map);
    expect(r).toMatchObject({ date: "2026-08-01", amount: 4.5, isCredit: false, include: true });
  });

  it("treats positive amounts as money in and excludes them by default", () => {
    const [r] = buildRows([["2026-08-01", "Refund", "20.00"]], map);
    expect(r).toMatchObject({ amount: 20, isCredit: true, include: false });
  });

  it("honours the flipped sign convention", () => {
    const [r] = buildRows([["2026-08-01", "Coffee", "4.50"]], map, { purchasesArePositive: true });
    expect(r).toMatchObject({ amount: 4.5, isCredit: false, include: true });
  });

  it("reads a debit/credit split", () => {
    const split = { date: 0, description: 1, amount: -1, debit: 2, credit: 3 };
    const rows = buildRows([
      ["2026-08-01", "Groceries", "84.20", ""],
      ["2026-08-02", "Refund", "", "15.00"],
    ], split);
    expect(rows[0]).toMatchObject({ amount: 84.2, isCredit: false, include: true });
    expect(rows[1]).toMatchObject({ amount: 15, isCredit: true, include: false });
  });

  it("keeps unparseable rows visible with a reason instead of dropping them", () => {
    const rows = buildRows([
      ["nope", "Bad date", "-5"],
      ["2026-08-01", "Bad amount", "N/A"],
      ["2026-08-01", "Zero", "0"],
    ], map);
    expect(rows.map((r) => r.error)).toEqual(["Unreadable date", "Unreadable amount", "Zero amount"]);
    expect(rows.every((r) => !r.include)).toBe(true);
  });
});

describe("markDuplicates", () => {
  const existing: Expense[] = [
    { id: "e1", title: "Coffee Shop", amount: 4.5, categoryId: "food", date: "2026-08-01" },
  ];
  const map = { date: 0, description: 1, amount: 2, debit: -1, credit: -1 };

  it("flags a row already saved as an expense", () => {
    const rows = markDuplicates(buildRows([["2026-08-01", "coffee shop", "-4.50"]], map), existing);
    expect(rows[0]).toMatchObject({ duplicate: true, include: false });
  });

  it("leaves genuinely new rows alone", () => {
    const rows = markDuplicates(buildRows([["2026-08-03", "Gas", "-30"]], map), existing);
    expect(rows[0]).toMatchObject({ duplicate: false, include: true });
  });

  it("catches repeats inside the same file", () => {
    const rows = markDuplicates(buildRows([
      ["2026-08-05", "Lunch", "-12"],
      ["2026-08-05", "Lunch", "-12"],
    ], map), []);
    expect(rows[0].duplicate).toBe(false);
    expect(rows[1].duplicate).toBe(true);
  });

  it("does not flag same-merchant charges on different days or amounts", () => {
    const rows = markDuplicates(buildRows([
      ["2026-08-02", "Coffee Shop", "-4.50"],
      ["2026-08-01", "Coffee Shop", "-9.00"],
    ], map), existing);
    expect(rows.every((r) => !r.duplicate)).toBe(true);
  });
});

describe("cleanDescription", () => {
  it("strips bank noise and long reference numbers", () => {
    expect(cleanDescription("POS DEBIT 1234567890 TRADER JOES")).toBe("TRADER JOES");
  });
  it("never returns an empty string", () => {
    expect(cleanDescription("POS DEBIT")).toBe("POS DEBIT");
  });
});
