import { describe, it, expect } from "vitest";
import { findReceiptMatches, mergeMatch } from "./receiptMatch";
import type { Expense } from "../types";

const e = (o: Partial<Expense> & { id: string }): Expense => ({
  title: "x", amount: 10, categoryId: "misc", date: "2026-07-01", ...o,
});

describe("findReceiptMatches", () => {
  it("pairs a scanned receipt with the card charge that posted after it", () => {
    const matches = findReceiptMatches([
      e({ id: "s1", merchant: "Home Depot", amount: 84.21, date: "2026-07-01", receiptPath: "u/1.jpg" }),
      e({ id: "c1", merchant: "HOME DEPOT #412", amount: 84.21, date: "2026-07-03" }),
    ]);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ confidence: "high", dayGap: 2 });
    expect(matches[0].charge.id).toBe("c1");
  });

  it("leaves unrelated spending alone", () => {
    expect(findReceiptMatches([
      e({ id: "s1", merchant: "Home Depot", amount: 84.21, receiptPath: "u/1.jpg" }),
      e({ id: "c1", merchant: "Shell Oil", amount: 41.15 }),
    ])).toEqual([]);
  });

  it("does not pair charges weeks apart", () => {
    expect(findReceiptMatches([
      e({ id: "s1", merchant: "Lowes", amount: 30, date: "2026-07-01", receiptPath: "u/1.jpg" }),
      e({ id: "c1", merchant: "Lowes", amount: 30, date: "2026-07-20" }),
    ])).toEqual([]);
  });

  it("allows a tip to move the posted amount", () => {
    const [m] = findReceiptMatches([
      e({ id: "s1", merchant: "Cafe Roma", amount: 40.00, date: "2026-07-01", receiptPath: "u/1.jpg" }),
      e({ id: "c1", merchant: "CAFE ROMA", amount: 40.75, date: "2026-07-02" }),
    ]);
    expect(m?.confidence).toBe("medium");
  });

  it("never reuses a record, so two real purchases stay two", () => {
    // One receipt cannot absorb both charges.
    const matches = findReceiptMatches([
      e({ id: "s1", merchant: "Gas Co", amount: 50, date: "2026-07-01", receiptPath: "u/1.jpg" }),
      e({ id: "c1", merchant: "Gas Co", amount: 50, date: "2026-07-01" }),
      e({ id: "c2", merchant: "Gas Co", amount: 50, date: "2026-07-02" }),
    ]);
    expect(matches).toHaveLength(1);
  });

  it("pairs on an exact same-day amount even when merchant text differs", () => {
    const [m] = findReceiptMatches([
      e({ id: "s1", merchant: "Sq *Joes", amount: 12.34, date: "2026-07-01", receiptPath: "u/1.jpg" }),
      e({ id: "c1", merchant: "TST* JOES BBQ", amount: 12.34, date: "2026-07-01" }),
    ]);
    expect(m?.confidence).toBe("medium");
  });

  it("ignores two receipts with no charge to match", () => {
    expect(findReceiptMatches([
      e({ id: "s1", amount: 10, receiptPath: "u/1.jpg" }),
      e({ id: "s2", amount: 10, receiptPath: "u/2.jpg" }),
    ])).toEqual([]);
  });
});

describe("mergeMatch", () => {
  it("keeps the cleared charge and takes the receipt", () => {
    const [m] = findReceiptMatches([
      e({ id: "s1", merchant: "Home Depot", title: "Lumber", amount: 84.21, date: "2026-07-01",
          receiptPath: "u/1.jpg", business: true, taxCategory: "supplies" }),
      e({ id: "c1", merchant: "HOME DEPOT #412", title: "HOME DEPOT #412", amount: 84.20, date: "2026-07-03" }),
    ]);
    const merged = mergeMatch(m);
    // The bank record is what reconciles against a statement.
    expect(merged.id).toBe("c1");
    expect(merged.amount).toBe(84.20);
    expect(merged.date).toBe("2026-07-03");
    // ...but it inherits everything the scan knew.
    expect(merged.receiptPath).toBe("u/1.jpg");
    expect(merged.business).toBe(true);
    expect(merged.taxCategory).toBe("supplies");
  });

  it("does not overwrite detail the charge already has", () => {
    const [m] = findReceiptMatches([
      e({ id: "s1", merchant: "Cafe", amount: 20, date: "2026-07-01", receiptPath: "u/1.jpg", taxCategory: "office" }),
      e({ id: "c1", merchant: "Cafe", amount: 20, date: "2026-07-01", taxCategory: "meals" }),
    ]);
    expect(mergeMatch(m).taxCategory).toBe("meals");
  });
});
