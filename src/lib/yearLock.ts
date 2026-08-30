import type { Settings } from "../types";

/**
 * Filed-year locks.
 *
 * Once a return has gone to a preparer, editing that year's numbers changes a
 * document that already exists in the world. This refuses those edits.
 *
 * It is a guardrail against mistakes, NOT a permission boundary — it's the
 * user's own data and they can unlock any year themselves. Nothing here should
 * be relied on for security.
 */

/** Thrown when a write would touch a filed year, so callers can show it as-is. */
export class YearLockedError extends Error {
  readonly year: number;
  constructor(year: number) {
    super(`${year} is marked as filed. Unlock it in Settings → Filed years to make changes.`);
    this.name = "YearLockedError";
    this.year = year;
  }
}

export const lockedYears = (settings: Pick<Settings, "lockedYears">): number[] =>
  [...new Set(settings.lockedYears ?? [])].filter((y) => Number.isInteger(y)).sort((a, b) => b - a);

export const isYearLocked = (settings: Pick<Settings, "lockedYears">, year: number): boolean =>
  lockedYears(settings).includes(year);

/** Year of a `YYYY-MM-DD` date, or null if it isn't one. */
export function yearOf(date: string | undefined | null): number | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const y = Number(date.slice(0, 4));
  return Number.isInteger(y) ? y : null;
}

/**
 * The first locked year any of these dates falls in, or null.
 *
 * Editing takes two dates — where a record is now and where it's moving to.
 * Both matter: moving an expense *out* of a filed year changes that year's
 * totals just as much as editing one inside it.
 */
export function lockedYearAmong(
  settings: Pick<Settings, "lockedYears">,
  ...dates: (string | undefined | null)[]
): number | null {
  for (const d of dates) {
    const y = yearOf(d);
    if (y !== null && isYearLocked(settings, y)) return y;
  }
  return null;
}

export function toggleYearLock(settings: Pick<Settings, "lockedYears">, year: number): number[] {
  const cur = lockedYears(settings);
  return cur.includes(year) ? cur.filter((y) => y !== year) : [...cur, year].sort((a, b) => b - a);
}
