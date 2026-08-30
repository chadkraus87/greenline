import { useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { Modal, Empty } from "../../components/ui";
import type { Expense } from "../../types";
import { money } from "../../lib/money";
import { findReceiptMatches, mergeMatch } from "../../lib/receiptMatch";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

/**
 * Reviews scanned receipts that look like the same purchase as an imported
 * card charge, and folds each confirmed pair into one expense.
 *
 * Nothing merges without a tick: a wrong merge deletes a real expense, so the
 * cost of being wrong is far higher than the cost of asking.
 */
export function ReceiptMatchModal({ expenses, onClose }: { expenses: Expense[]; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [skip, setSkip] = useState<Record<string, boolean>>({});

  const matches = useMemo(() => findReceiptMatches(expenses), [expenses]);
  // Only the confident pairs are pre-ticked; the rest are opt-in.
  const isOn = (id: string, confidence: string) =>
    skip[id] === undefined ? confidence === "high" : !skip[id];
  const selected = matches.filter((m) => isOn(m.scanned.id, m.confidence));

  const apply = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (const m of selected) {
        await act.mergeReceiptIntoCharge(mergeMatch(m), m.scanned.id);
        n++;
      }
      toast(`Merged ${n} duplicate${n === 1 ? "" : "s"}`);
      onClose();
    } catch (e) {
      toast((e as Error).message || "Couldn't merge", "clay");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Receipts that match a card charge" onClose={onClose} wide>
      <p style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 6 }}>
        Scanning a receipt and importing the statement records the same purchase twice.
        Merging keeps the charge that cleared your account and attaches the receipt to it.
      </p>

      {matches.length === 0 ? (
        <Empty text="No duplicates found — every scanned receipt looks like its own purchase." />
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: "var(--dim)", margin: "10px 0 6px" }}>
            <strong style={{ color: "var(--fern)" }}>{selected.length}</strong> of {matches.length} will be merged
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 9 }}>
            <table className="gl-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }} /><th>Receipt</th><th>Card charge</th><th>Why</th>
                  <th style={{ textAlign: "right" }}>Kept</th>
                </tr>
              </thead>
              <tbody>
                {matches.map((m) => (
                  <tr key={m.scanned.id}>
                    <td>
                      <input type="checkbox" checked={isOn(m.scanned.id, m.confidence)}
                        aria-label={`Merge ${m.scanned.merchant || m.scanned.title}`}
                        onChange={(e) => setSkip({ ...skip, [m.scanned.id]: !e.target.checked })} />
                    </td>
                    <td>
                      <div>{m.scanned.merchant || m.scanned.title}</div>
                      <div className="gl-mono" style={{ fontSize: 11, color: "var(--dim)" }}>
                        {m.scanned.date} · {money(m.scanned.amount)}
                      </div>
                    </td>
                    <td>
                      <div>{m.charge.merchant || m.charge.title}</div>
                      <div className="gl-mono" style={{ fontSize: 11, color: "var(--dim)" }}>
                        {m.charge.date} · {money(m.charge.amount)}
                      </div>
                    </td>
                    <td style={{ fontSize: 11.5, color: m.confidence === "high" ? "var(--fern)" : "var(--brass)" }}>
                      {m.reason}
                    </td>
                    <td className="gl-mono" style={{ textAlign: "right", fontSize: 12 }}>
                      {money(m.charge.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="gl-btn" onClick={onClose}>Cancel</button>
            <button className="gl-btn primary" disabled={busy || selected.length === 0} onClick={apply}>
              <Link2 size={14} /> Merge {selected.length || ""}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
