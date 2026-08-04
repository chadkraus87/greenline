import { useCallback, useEffect, useState } from "react";
import type { CalendarShare } from "../types";
import { listCalendarShares } from "../db/actions";
import { onDataChange } from "../data/sync";

/** Calendar-sharing links in both directions, refreshed on any mutation. */
export function useShares(): { shares: CalendarShare[]; reload: () => void } {
  const [shares, setShares] = useState<CalendarShare[]>([]);

  const load = useCallback(async () => {
    try { setShares(await listCalendarShares()); }
    catch { /* not signed in yet, or not approved — leave empty */ }
  }, []);

  useEffect(() => {
    load();
    return onDataChange(load);
  }, [load]);

  return { shares, reload: load };
}
