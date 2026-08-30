import type { Expense } from "../types";
import { merchantKey } from "./autoCategorize";
import { round2 } from "./money";

/**
 * Finds charges that repeat on a schedule — subscriptions, memberships,
 * retainers — from spending history alone.
 *
 * Nobody remembers every subscription they signed up for, and the ones that
 * quietly renew are exactly the ones worth seeing. This looks for the same
 * merchant billing a similar amount at a steady interval.
 */

export type Cadence = "weekly" | "monthly" | "quarterly" | "annual";

export interface RecurringCharge {
  key: string;
  merchant: string;
  cadence: Cadence;
  /** Median charge — resistant to a one-off annual or prorated amount. */
  typicalAmount: number;
  /** What it works out to per month, for comparing a yearly plan to a monthly one. */
  monthlyCost: number;
  occurrences: number;
  firstDate: string;
  lastDate: string;
  /** When the next one is due, extrapolated from the cadence. */
  nextExpected: string;
  categoryId?: string;
  /** True when the most recent charge is well past due — likely cancelled. */
  lapsed: boolean;
}

/** Cadence buckets, in days, with the slack real billing dates actually show. */
const CADENCES: { cadence: Cadence; days: number; min: number; max: number; perMonth: number }[] = [
  { cadence: "weekly", days: 7, min: 5, max: 9, perMonth: 52 / 12 },
  { cadence: "monthly", days: 30, min: 25, max: 36, perMonth: 1 },
  { cadence: "quarterly", days: 91, min: 80, max: 100, perMonth: 1 / 3 },
  { cadence: "annual", days: 365, min: 330, max: 400, perMonth: 1 / 12 },
];

const dayNumber = (d: string): number => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86_400_000);

const addDays = (d: string, n: number): string =>
  new Date((dayNumber(d) + n) * 86_400_000).toISOString().slice(0, 10);

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/**
 * Amounts count as "the same charge" within 10% or 100 units of currency,
 * whichever is looser — subscriptions get price rises and tax changes, and a
 * $9.99 plan going to $10.99 is still the same subscription.
 */
function amountsConsistent(amounts: number[]): boolean {
  const mid = median(amounts);
  if (mid <= 0) return false;
  const tolerance = Math.max(mid * 0.1, 1);
  return amounts.every((a) => Math.abs(a - mid) <= tolerance);
}

function classify(gaps: number[]): Cadence | null {
  if (gaps.length === 0) return null;
  const mid = median(gaps);
  const match = CADENCES.find((c) => mid >= c.min && mid <= c.max);
  if (!match) return null;
  // Every gap has to look like the same cadence, or it's just clustered spending.
  const ok = gaps.every((g) => g >= match.min && g <= match.max);
  return ok ? match.cadence : null;
}

/**
 * @param expenses  full history
 * @param asOf      today, as `YYYY-MM-DD` — injected so results are testable
 * @param minOccurrences  two points make a line; three make a pattern
 */
export function findRecurring(expenses: Expense[], asOf: string, minOccurrences = 3): RecurringCharge[] {
  const groups = new Map<string, Expense[]>();
  for (const e of expenses) {
    const key = merchantKey(e.merchant || e.title);
    if (!key) continue;
    const list = groups.get(key);
    if (list) list.push(e); else groups.set(key, [e]);
  }

  const found: RecurringCharge[] = [];

  for (const [key, list] of groups) {
    if (list.length < minOccurrences) continue;
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));

    // Same-day duplicates are a double charge, not a second billing cycle.
    const dates = [...new Set(sorted.map((e) => e.date))];
    if (dates.length < minOccurrences) continue;

    const amounts = sorted.map((e) => e.amount);
    if (!amountsConsistent(amounts)) continue;

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(dayNumber(dates[i]) - dayNumber(dates[i - 1]));
    const cadence = classify(gaps);
    if (!cadence) continue;

    const spec = CADENCES.find((c) => c.cadence === cadence)!;
    const typicalAmount = round2(median(amounts));
    const lastDate = dates[dates.length - 1];
    const nextExpected = addDays(lastDate, Math.round(median(gaps)));

    found.push({
      key,
      merchant: sorted[sorted.length - 1].merchant || sorted[sorted.length - 1].title,
      cadence,
      typicalAmount,
      monthlyCost: round2(typicalAmount * spec.perMonth),
      occurrences: dates.length,
      firstDate: dates[0],
      lastDate,
      nextExpected,
      categoryId: sorted[sorted.length - 1].categoryId,
      // Overdue by more than a full extra cycle — probably cancelled, so it
      // shouldn't be counted in what you're currently paying.
      lapsed: dayNumber(asOf) - dayNumber(lastDate) > spec.max + spec.days,
    });
  }

  return found.sort((a, b) => b.monthlyCost - a.monthlyCost);
}

/** What the still-active recurring charges cost per month, combined. */
export const recurringMonthlyTotal = (charges: RecurringCharge[]): number =>
  round2(charges.filter((c) => !c.lapsed).reduce((s, c) => s + c.monthlyCost, 0));
