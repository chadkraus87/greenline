import { describe, it, expect } from "vitest";
import { merchantKey, buildMerchantIndex, suggestCategory, suggestionLabel } from "./autoCategorize";
import type { Category, Expense } from "../types";

const cats: Category[] = [
  { id: "c-housing", name: "Housing", color: "#000", limit: 0 },
  { id: "c-utilities", name: "Utilities", color: "#000", limit: 0 },
  { id: "c-food", name: "Food & Dining", color: "#000", limit: 0 },
  { id: "c-transport", name: "Transportation", color: "#000", limit: 0 },
  { id: "c-health", name: "Healthcare", color: "#000", limit: 0 },
  { id: "c-fun", name: "Entertainment", color: "#000", limit: 0 },
  { id: "c-misc", name: "Miscellaneous", color: "#000", limit: 0 },
];

const exp = (o: Partial<Expense>): Expense => ({
  id: "x", title: "t", amount: 10, categoryId: "c-misc", date: "2026-01-01", ...o,
});

describe("merchantKey", () => {
  it("normalises case, punctuation, and store numbers", () => {
    expect(merchantKey("TRADER JOE'S #482")).toBe("trader joe s");
    expect(merchantKey("POS DEBIT 4429183746 SHELL OIL")).toBe("shell oil");
  });
  it("collapses bank noise and corporate suffixes", () => {
    expect(merchantKey("ACME SUPPLY CO., INC.")).toBe("acme supply");
  });
  it("returns empty for junk", () => {
    expect(merchantKey("")).toBe("");
    expect(merchantKey("###")).toBe("");
  });
});

describe("buildMerchantIndex + suggestCategory (history)", () => {
  it("reuses the category you picked for the same merchant", () => {
    const idx = buildMerchantIndex([exp({ merchant: "Shell Oil", categoryId: "c-transport" })]);
    const s = suggestCategory("SHELL OIL 8871", idx, cats);
    expect(s).toMatchObject({ categoryId: "c-transport", source: "history", seen: 1 });
  });

  it("history beats the built-in table", () => {
    // Built-in maps Starbucks to Food & Dining; the user files it under Entertainment.
    const idx = buildMerchantIndex([exp({ merchant: "Starbucks", categoryId: "c-fun" })]);
    expect(suggestCategory("STARBUCKS 119", idx, cats).categoryId).toBe("c-fun");
  });

  it("the most recent choice wins when you change your mind", () => {
    const idx = buildMerchantIndex([
      exp({ merchant: "Home Depot", categoryId: "c-misc", date: "2026-01-01" }),
      exp({ merchant: "Home Depot", categoryId: "c-housing", date: "2026-06-01" }),
    ]);
    const s = suggestCategory("HOME DEPOT #1120", idx, cats);
    expect(s.categoryId).toBe("c-housing");
    expect(s.seen).toBe(2);
  });

  it("carries business tagging forward", () => {
    const idx = buildMerchantIndex([
      exp({ merchant: "Grainger", categoryId: "c-misc", business: true, taxCategory: "supplies", businessPct: 100 }),
    ]);
    expect(suggestCategory("GRAINGER 9931", idx, cats)).toMatchObject({
      business: true, taxCategory: "supplies", source: "history",
    });
  });

  it("matches partial merchant names in either direction", () => {
    const idx = buildMerchantIndex([exp({ merchant: "Chipotle", categoryId: "c-food" })]);
    expect(suggestCategory("CHIPOTLE MEXICAN GRILL", idx, cats).categoryId).toBe("c-food");
  });
});

describe("suggestCategory (built-in rules)", () => {
  it("recognises fuel merchants and suggests the vehicle line", () => {
    const s = suggestCategory("CHEVRON 00204513", new Map(), cats);
    expect(s).toMatchObject({ categoryId: "c-transport", taxCategory: "car", source: "rule" });
  });
  it("maps trade suppliers to supplies", () => {
    expect(suggestCategory("THE HOME DEPOT 6112", new Map(), cats)).toMatchObject({ taxCategory: "supplies" });
  });
  it("maps restaurants to meals", () => {
    expect(suggestCategory("CHIPOTLE 2245", new Map(), cats)).toMatchObject({ categoryId: "c-food", taxCategory: "meals" });
  });
  it("suggests a category but no tax line for ambiguous retail", () => {
    const s = suggestCategory("AMZN Mktp US", new Map(), cats);
    expect(s.categoryId).toBe("c-misc");
    expect(s.taxCategory).toBeUndefined();
  });
  it("returns nothing for an unknown merchant rather than guessing", () => {
    expect(suggestCategory("ZZQQ LOCAL VENDOR", new Map(), cats).source).toBe("none");
  });
  it("skips a rule when the user deleted that category", () => {
    const s = suggestCategory("CHEVRON", new Map(), [{ id: "only", name: "Groceries", color: "#000", limit: 0 }]);
    expect(s.source).toBe("none");
  });
});

describe("suggestionLabel", () => {
  it("explains where a suggestion came from", () => {
    expect(suggestionLabel({ source: "history", seen: 3 })).toContain("last 3");
    expect(suggestionLabel({ source: "history", seen: 1 })).toContain("previous");
    expect(suggestionLabel({ source: "rule", seen: 0 })).toBe("recognised merchant");
    expect(suggestionLabel({ source: "none", seen: 0 })).toBe("");
  });
});
