import { useMemo, useState } from "react";
import { Paperclip, Search } from "lucide-react";
import { Modal, Empty } from "../../components/ui";
import type { Category, Expense } from "../../types";
import { money } from "../../lib/money";
import { rankAttachCandidates } from "../../lib/attachReceipt";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

/** Attach a stray receipt to an expense that's already recorded, instead of creating a duplicate. */
export function AttachReceiptModal({ receiptPath, uploadedAt, expenses, categories, onClose }:
  { receiptPath: string; uploadedAt: string | null; expenses: Expense[]; categories: Category[]; onClose: () => void }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState("");
  const candidates = useMemo(() => rankAttachCandidates(expenses, uploadedAt, q).slice(0, 60), [expenses, uploadedAt, q]);
  const catName = (id: string) => categories.find((c) => c.id === id)?.name ?? "";

  const attach = async (e: Expense) => {
    setBusy(e.id);
    try {
      await act.saveExpense({ ...e, receiptPath });
      toast(`Receipt attached to ${e.merchant || e.title}`);
      onClose();
    } catch (err) {
      toast((err as Error).message || "Couldn't attach", "clay");
    } finally { setBusy(""); }
  };

  return (
    <Modal title="Attach to an expense" onClose={onClose} wide>
      <p style={{ fontSize: 14, color: "var(--dim)", marginTop: 4 }}>
        Pick the purchase this receipt belongs to. Expenses closest to when it was uploaded are listed first;
        ones that already have a receipt aren't shown.
      </p>
      <div className="gl-search" style={{ maxWidth: "none", margin: "10px 0 12px" }}>
        <Search size={15} aria-hidden />
        <input className="gl-input" type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Merchant or amount…" aria-label="Search expenses" />
      </div>
      {candidates.length === 0 ? <Empty text={q ? "Nothing matches that search." : "Every expense already has a receipt."} /> : (
        <div className="gl-card" style={{ overflow: "hidden" }}>
          {candidates.map((e) => (
            <div className="gl-row" key={e.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.merchant || e.title}</div>
                <div style={{ fontSize: 13, color: "var(--dim)" }}>{e.date}{catName(e.categoryId) && ` · ${catName(e.categoryId)}`}</div>
              </div>
              <span className="gl-mono" style={{ fontWeight: 600 }}>{money(e.amount)}</span>
              <button className="gl-btn" disabled={!!busy} onClick={() => attach(e)}>
                <Paperclip size={15} aria-hidden /> Attach
              </button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
