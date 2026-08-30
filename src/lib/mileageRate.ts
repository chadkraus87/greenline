import type { Settings } from "../types";

/** Fallback when nothing has ever been configured. */
export const DEFAULT_MILEAGE_RATE = 0.7;

const numericYears = (rates: Record<string, number>): number[] =>
  Object.keys(rates).map(Number).filter((y) => Number.isInteger(y) && y > 1900).sort((a, b) => a - b);

/**
 * The mileage rate that applies to a given year.
 *
 * The IRS rate changes annually, and a filed year has to keep the rate it was
 * filed with — a single stored value silently revalues every prior year the
 * moment it's updated, which quietly changes numbers on an already-exported
 * tax package.
 *
 * Falls back the way a person would expect: the year itself, else the most
 * recent earlier year (a rate carries forward until it's changed), else the
 * earliest known rate, else the legacy scalar.
 */
export function rateForYear(settings: Pick<Settings, "mileageRates" | "mileageRate">, year: number): number {
  const rates = settings.mileageRates ?? {};
  const exact = rates[String(year)];
  if (Number.isFinite(exact) && exact >= 0) return exact;

  const years = numericYears(rates);
  const earlier = years.filter((y) => y < year).pop();
  if (earlier !== undefined) return rates[String(earlier)];
  if (years.length > 0) return rates[String(years[0])];

  return Number.isFinite(settings.mileageRate) && settings.mileageRate > 0
    ? settings.mileageRate
    : DEFAULT_MILEAGE_RATE;
}

/** True when this year has a rate of its own, rather than inheriting one. */
export function hasOwnRate(settings: Pick<Settings, "mileageRates">, year: number): boolean {
  const v = (settings.mileageRates ?? {})[String(year)];
  return Number.isFinite(v) && v >= 0;
}

/**
 * Set (or clear, with 0 or below) one year's rate.
 *
 * Returns a new map — callers persist it, so mutating the stored object would
 * make the change invisible to React.
 */
export function setRateForYear(
  rates: Record<string, number> | undefined,
  year: number,
  rate: number,
): Record<string, number> {
  const next = { ...(rates ?? {}) };
  if (!Number.isFinite(rate) || rate <= 0) delete next[String(year)];
  else next[String(year)] = Math.min(10, rate);
  return next;
}

/** Years with an explicit rate, newest first. */
export function ratedYears(settings: Pick<Settings, "mileageRates">): number[] {
  return numericYears(settings.mileageRates ?? {}).reverse();
}
