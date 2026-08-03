import { describe, it, expect } from "vitest";
import { toCsv, expensesCsv } from "./csv";
import type { AppData } from "../types";

const data = (over: Partial<AppData> = {}): AppData => ({
  settings: { theme: "dark", clock24: false, startBalance: 0, bufferFloor: 0, extraDebtBudget: 0, emergencyMonths: 3, rolloverBudgets: false },
  categories: [{ id: "food", name: "Food", color: "#000", limit: 0 }],
  incomes: [], bills: [], expenses: [], goals: [], events: [], sinkingFunds: [], debts: [],
  ...over,
});

describe("csv", () => {
  it("quotes cells containing commas, quotes, and newlines", () => {
    expect(toCsv([["a,b", 'he said "hi"', "line\nbreak"]])).toBe('"a,b","he said ""hi""","line\nbreak"');
  });
  it("neutralizes formula injection (leading = + - @)", () => {
    const d = data({ expenses: [{ id: "e", title: "=1+1", amount: 5, categoryId: "food", date: "2026-07-01", merchant: "@evil" }] });
    const csv = expensesCsv(d);
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@evil");
    expect(csv).not.toMatch(/,=1\+1,/); // never a raw formula cell
  });
});
