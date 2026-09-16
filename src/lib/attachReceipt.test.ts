import { describe, it, expect } from "vitest";
import { rankAttachCandidates } from "./attachReceipt";
import type { Expense } from "../types";

const e = (id: string, date: string, extra: Partial<Expense> = {}): Expense =>
  ({ id, title: id, amount: 10, categoryId: "misc", date, ...extra });

describe("rankAttachCandidates", () => {
  it("never offers an expense that already has a receipt", () => {
    // Attaching there would silently orphan the image it already has.
    const out = rankAttachCandidates([e("has", "2026-09-10", { receiptPath: "u/1.jpg" }), e("free", "2026-09-10")], "2026-09-10");
    expect(out.map((x) => x.id)).toEqual(["free"]);
  });

  it("ranks expenses nearest the upload date first", () => {
    const out = rankAttachCandidates([e("far", "2026-08-01"), e("near", "2026-09-09"), e("mid", "2026-09-01")], "2026-09-10T15:00:00Z");
    expect(out.map((x) => x.id)).toEqual(["near", "mid", "far"]);
  });

  it("matches merchant or the amount as typed, including a dollar sign", () => {
    const list = [e("a", "2026-09-10", { merchant: "Home Depot", amount: 84.21 }), e("b", "2026-09-10", { merchant: "Shell", amount: 41.15 })];
    expect(rankAttachCandidates(list, null, "depot").map((x) => x.id)).toEqual(["a"]);
    expect(rankAttachCandidates(list, null, "$41.15").map((x) => x.id)).toEqual(["b"]);
  });

  it("falls back to newest first when there's no date to anchor on", () => {
    expect(rankAttachCandidates([e("old", "2026-01-01"), e("new", "2026-09-01")], null).map((x) => x.id)).toEqual(["new", "old"]);
  });
});
