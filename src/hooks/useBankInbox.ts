import { useCallback, useEffect, useRef, useState } from "react";
import { countNewBankTransactions, listBankConnections, syncBanks } from "../db/bank";
import { onDataChange } from "../data/sync";
import { DEMO } from "../dev/demo";

/**
 * How many bank transactions are waiting for review.
 *
 * Also nudges a sync once when the app opens, so a transaction from this
 * morning shows up without waiting for the next scheduled run. The server
 * refuses to sync a connection more than once every few hours, so opening the
 * app repeatedly can't run up the bank's request limit.
 */
export function useBankInbox(signedIn: boolean): { newCount: number; hasConnections: boolean } {
  const [newCount, setNewCount] = useState(0);
  const [hasConnections, setHasConnections] = useState(false);
  const nudged = useRef(false);

  const load = useCallback(async () => {
    if ((import.meta.env.DEV && DEMO)) { setNewCount(4); setHasConnections(true); return; }
    try {
      const conns = await listBankConnections();
      setHasConnections(conns.length > 0);
      if (conns.length === 0) { setNewCount(0); return; }
      setNewCount(await countNewBankTransactions());
      if (!nudged.current) {
        nudged.current = true;
        void syncBanks().catch(() => { /* surfaced in Settings; not worth a toast on open */ });
      }
    } catch { /* table unavailable or not approved — nothing to show */ }
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    void load();
    return onDataChange(() => { void load(); });
  }, [signedIn, load]);

  return { newCount, hasConnections };
}
