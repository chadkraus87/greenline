import { useCallback, useEffect, useState } from "react";
import type { AppData } from "../types";
import { loadAll } from "../db/repo";
import { onDataChange } from "../data/sync";

/** Loads the signed-in user's full dataset and refetches whenever a mutation
 *  emits a change. Small per-user data → a full refetch is simplest and fast. */
export function useAppData(): { data: AppData | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<AppData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setData(await loadAll());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    return onDataChange(load);
  }, [load]);

  return { data, loading, reload: load };
}
