import { describe, it, expect } from "vitest";
import { taxReadiness, compareYears, retentionGroups, RECEIPT_THRESHOLD } from "./taxReadiness";
import type { AppData, Expense } from "../types";

const base = (over: Partial<AppData> = {}): AppData => ({
  settings: {
    theme: "dark", clock24: false, startBalance: 0, bufferFloor: 0, extraDebtBudget: 0,
    emergencyMonths: 3, rolloverBudgets: false, businessMode: true, mileageRate: 0.7,
  },
  categories: [], incomes: [], bills: [], expenses: [], goals: [], events: [],
  sinkingFunds: [], debts: [], mileage: [],
  ...over,
});

const exp = (o: Partial<Expense>): Expense => ({
  id: "x", title: "t", amount: 100, categoryId: "c", date: "2026-05-01", business: true,
  taxCategory: "supplies", receiptPath: "uid/r.jpg", ...o,
});

const ids = (r: { issues: { id: string }[] }) => r.issues.map((i) => i.id);

describe("taxReadiness", () => {
  it("reports nothing outstanding for a clean year", () => {
    const d = base({
      expenses: [exp({})],
      mileage: [{ id: "m", date: "2026-01-01", miles: 10, purpose: "Client" }],
    });
    const r = taxReadiness(d, 2026);
    expect(r.issues).toHaveLength(0);
    expect(r.ready).toBe(true);
    expect(r.score).toBe(100);
  });

  it("flags business expenses with no Schedule C line as a blocker", () => {
    const d = base({ expenses: [exp({ taxCategory: undefined, amount: 250 })], mileage: [{ id: "m", date: "2026-01-01", miles: 1, purpose: "x" }] });
    const r = taxReadiness(d, 2026);
    const issue = r.issues.find((i) => i.id === "uncategorized")!;
    expect(issue.level).toBe("blocker");
    expect(issue.count).toBe(1);
    expect(issue.amount).toBe(250);
    expect(r.ready).toBe(false);
  });

  it("flags larger business expenses missing a receipt, but not small ones", () => {
    const d = base({
      expenses: [
        exp({ id: "big", amount: RECEIPT_THRESHOLD + 10, receiptPath: undefined }),
        exp({ id: "small", amount: RECEIPT_THRESHOLD - 10, receiptPath: undefined }),
      ],
      mileage: [{ id: "m", date: "2026-01-01", miles: 1, purpose: "x" }],
    });
    const issue = taxReadiness(d, 2026).issues.find((i) => i.id === "missing-receipts")!;
    expect(issue.count).toBe(1);
    expect(issue.level).toBe("warning");
  });

  it("reports unfiled receipts passed in from storage", () => {
    const d = base({ expenses: [exp({})], mileage: [{ id: "m", date: "2026-01-01", miles: 1, purpose: "x" }] });
    expect(ids(taxReadiness(d, 2026, 3))).toContain("unfiled");
  });

  it("flags business income with nothing marked received", () => {
    const d = base({
      expenses: [exp({})],
      mileage: [{ id: "m", date: "2026-01-01", miles: 1, purpose: "x" }],
      incomes: [{ id: "i", name: "Training", amount: 100, frequency: "monthly", anchorDate: "2026-01-01", business: true, received: {} }],
    });
    const issue = taxReadiness(d, 2026).issues.find((i) => i.id === "income-unmarked")!;
    expect(issue.level).toBe("blocker");
  });

  it("does not flag income that has a payment received in the year", () => {
    const d = base({
      expenses: [exp({})],
      mileage: [{ id: "m", date: "2026-01-01", miles: 1, purpose: "x" }],
      incomes: [{ id: "i", name: "Training", amount: 100, frequency: "monthly", anchorDate: "2026-01-01", business: true, received: { "2026-03-01": true } }],
    });
    expect(ids(taxReadiness(d, 2026))).not.toContain("income-unmarked");
  });

  it("nudges when there is business activity but no mileage", () => {
    const d = base({ expenses: [exp({})] });
    expect(ids(taxReadiness(d, 2026))).toContain("no-mileage");
  });

  it("notices business mode with nothing tagged", () => {
    expect(ids(taxReadiness(base(), 2026))).toContain("nothing-tagged");
  });

  it("scores down for blockers more than warnings", () => {
    const blocker = base({ expenses: [exp({ taxCategory: undefined })], mileage: [{ id: "m", date: "2026-01-01", miles: 1, purpose: "x" }] });
    const warn = base({ expenses: [exp({ amount: 500, receiptPath: undefined })], mileage: [{ id: "m", date: "2026-01-01", miles: 1, purpose: "x" }] });
    expect(taxReadiness(blocker, 2026).score).toBeLessThan(taxReadiness(warn, 2026).score);
  });

  it("ignores other years entirely", () => {
    const d = base({ expenses: [exp({ date: "2025-05-01", taxCategory: undefined })] });
    expect(ids(taxReadiness(d, 2026))).not.toContain("uncategorized");
  });
});

describe("compareYears", () => {
  const d = base({
    incomes: [{
      id: "i", name: "Training", amount: 1000, frequency: "monthly", anchorDate: "2025-01-01", business: true,
      received: { "2025-01-01": true, "2026-01-01": true, "2026-02-01": true },
    }],
    expenses: [
      exp({ id: "a", amount: 500, taxCategory: "supplies", date: "2025-03-01" }),
      exp({ id: "b", amount: 800, taxCategory: "supplies", date: "2026-03-01" }),
      exp({ id: "c", amount: 300, taxCategory: "advertising", date: "2025-04-01" }), // dropped in 2026
      exp({ id: "e", amount: 200, taxCategory: "office", date: "2026-04-01" }),      // new in 2026
    ],
  });
  const c = compareYears(d, 2026);

  it("compares income across years", () => {
    expect(c.income).toEqual({ current: 2000, prior: 1000, delta: 1000 });
  });

  it("computes per-line deltas and percentage change", () => {
    const supplies = c.lines.find((l) => l.id === "supplies")!;
    expect(supplies).toMatchObject({ current: 800, prior: 500, delta: 300, changePct: 60 });
  });

  it("reports no percentage when there is no prior-year base", () => {
    expect(c.lines.find((l) => l.id === "office")!.changePct).toBeNull();
  });

  it("surfaces lines claimed last year but not this year", () => {
    expect(c.droppedLines.map((l) => l.id)).toEqual(["advertising"]);
  });

  it("orders lines by size of change", () => {
    expect(Math.abs(c.lines[0].delta)).toBeGreaterThanOrEqual(Math.abs(c.lines[1].delta));
  });
});

describe("retentionGroups", () => {
  it("groups receipts by year, split business vs personal", () => {
    const g = retentionGroups([
      exp({ id: "1", date: "2024-01-01", business: true, receiptPath: "u/a.jpg" }),
      exp({ id: "2", date: "2024-06-01", business: false, receiptPath: "u/b.jpg" }),
      exp({ id: "3", date: "2026-01-01", business: false, receiptPath: "u/c.jpg" }),
      exp({ id: "4", date: "2026-02-01", receiptPath: undefined }), // no image
    ]);
    expect(g.map((x) => x.year)).toEqual(["2026", "2024"]); // newest first
    const y2024 = g.find((x) => x.year === "2024")!;
    expect(y2024.business.count).toBe(1);
    expect(y2024.personal.count).toBe(1);
    expect(g.find((x) => x.year === "2026")!.personal.paths).toEqual(["u/c.jpg"]);
  });
});
