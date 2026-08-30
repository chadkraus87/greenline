import { describe, it, expect } from "vitest";
import { findRecurring, recurringMonthlyTotal } from "./recurring";
import type { Expense } from "../types";

let n = 0;
const ex = (merchant: string, date: string, amount: number): Expense =>
  ({ id: `e${++n}`, title: merchant, merchant, amount, categoryId: "misc", date });

const monthly = (merchant: string, amount: number, months: string[]) =>
  months.map((m) => ex(merchant, `${m}-14`, amount));

describe("findRecurring", () => {
  it("finds a monthly subscription", () => {
    const [r] = findRecurring(monthly("Netflix", 15.49, ["2026-05", "2026-06", "2026-07"]), "2026-08-01");
    expect(r).toMatchObject({ cadence: "monthly", typicalAmount: 15.49, occurrences: 3, lapsed: false });
    expect(r.nextExpected).toBe("2026-08-14"); // billed on the 14th
  });

  it("ignores a merchant visited irregularly", () => {
    // Same shop, no schedule — a coffee habit isn't a subscription.
    const coffee = [ex("Cafe", "2026-05-02", 4), ex("Cafe", "2026-05-03", 4), ex("Cafe", "2026-06-19", 4)];
    expect(findRecurring(coffee, "2026-08-01")).toEqual([]);
  });

  it("ignores a merchant whose amounts swing wildly", () => {
    const shop = monthly("Grocer", 0, ["2026-05", "2026-06", "2026-07"]);
    shop[0].amount = 20; shop[1].amount = 210; shop[2].amount = 95;
    expect(findRecurring(shop, "2026-08-01")).toEqual([]);
  });

  it("tolerates a price rise", () => {
    const s = monthly("Spotify", 0, ["2026-05", "2026-06", "2026-07"]);
    s[0].amount = 10.99; s[1].amount = 10.99; s[2].amount = 11.99;
    const [r] = findRecurring(s, "2026-08-01");
    expect(r?.cadence).toBe("monthly");
  });

  it("needs three billings, not two", () => {
    expect(findRecurring(monthly("Gym", 40, ["2026-06", "2026-07"]), "2026-08-01")).toEqual([]);
  });

  it("does not count a same-day double charge as a cycle", () => {
    const dupes = [ex("X", "2026-07-01", 9), ex("X", "2026-07-01", 9), ex("X", "2026-07-01", 9)];
    expect(findRecurring(dupes, "2026-08-01")).toEqual([]);
  });

  it("finds an annual renewal", () => {
    const yearly = [ex("Domain", "2024-03-01", 22), ex("Domain", "2025-03-02", 22), ex("Domain", "2026-03-01", 24)];
    const [r] = findRecurring(yearly, "2026-08-01");
    expect(r).toMatchObject({ cadence: "annual" });
    expect(r.monthlyCost).toBeCloseTo(1.83, 1);
  });

  it("flags a charge that stopped as lapsed", () => {
    const [r] = findRecurring(monthly("OldGym", 40, ["2025-01", "2025-02", "2025-03"]), "2026-08-01");
    expect(r.lapsed).toBe(true);
  });

  it("sorts by what each costs per month", () => {
    const all = [
      ...monthly("Cheap", 5, ["2026-05", "2026-06", "2026-07"]),
      ...monthly("Pricey", 60, ["2026-05", "2026-06", "2026-07"]),
    ];
    expect(findRecurring(all, "2026-08-01").map((r) => r.merchant)).toEqual(["Pricey", "Cheap"]);
  });
});

describe("recurringMonthlyTotal", () => {
  it("counts only what's still active", () => {
    const charges = findRecurring([
      ...monthly("Live", 10, ["2026-05", "2026-06", "2026-07"]),
      ...monthly("Dead", 99, ["2025-01", "2025-02", "2025-03"]),
    ], "2026-08-01");
    expect(recurringMonthlyTotal(charges)).toBe(10);
  });
});
