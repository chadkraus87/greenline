import type { Settings } from "../types";
import { YearLockedError, lockedYearAmong } from "../lib/yearLock";

/**
 * The filed-year locks, cached where the mutation layer can reach them.
 *
 * Writes live in db/actions, which has no component context to read settings
 * from, and re-fetching settings before every save would add a round trip to
 * each one. repo.loadAll refreshes this on every load, which is also every
 * time settings change (patchSettings emits a data change).
 */
let current: Pick<Settings, "lockedYears"> = { lockedYears: [] };

export const setLockState = (settings: Pick<Settings, "lockedYears">): void => {
  current = { lockedYears: [...(settings.lockedYears ?? [])] };
};

/**
 * Refuse the write if any of these dates falls in a filed year.
 *
 * Pass both the old and new date when editing — moving a record out of a filed
 * year changes that year's totals just as much as changing one inside it.
 */
export function guardYears(...dates: (string | undefined | null)[]): void {
  const year = lockedYearAmong(current, ...dates);
  if (year !== null) throw new YearLockedError(year);
}
