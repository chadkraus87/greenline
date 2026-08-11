import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Modal, Empty } from "../../components/ui";
import type { Category, Expense } from "../../types";
import { money } from "../../lib/money";
import { buildMerchantIndex, suggestCategory, suggestionLabel } from "../../lib/autoCategorize";
import { TAX_LINE_BY_ID } from "../../lib/tax";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

interface Proposal {
  expense: Expense;
  categoryId?: string;
  taxCategory?: string;
  reason: string;
  apply: boolean;
}

/**
 * Runs the categorizer over expenses that are still uncategorized and proposes
 * fixes in bulk. Every row is reviewable and nothing is written until you confirm.
 */
export function BulkCategorizeModal({ expenses, categories, businessMode, onClose }:
  { expenses: Expense[]; categories: Category[]; businessMode: boolean; onClose: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [skip, setSkip] = useState<Record<string, boolean>>({});

  const proposals = useMemo<Proposal[]>(() => {
    const index = buildMerchantIndex(expenses);
    const defaultCat = categories[0]?.id;

    return expenses
      .filter((e) => {
        // Worth proposing if it has no category at all, or it's business
        // spending with no Schedule C line (which silently loses the deduction).
        const noCategory = !e.categoryId || !categories.some((c) => c.id === e.categoryId) || e.categoryId === defaultCat;
        const noTaxLine = businessMode && e.business && !e.taxCategory;
        return noCategory || noTaxLine;
      })
      .map((e) => {
        const s = suggestCategory(e.merchant || e.title, index, categories);
        const wantsCategory = s.categoryId && s.categoryId !== e.categoryId;
        const wantsTax = businessMode && e.business && !e.taxCategory && s.taxCategory;
        if (!wantsCategory && !wantsTax) return null;
        return {
          expense: e,
          categoryId: wantsCategory ? s.categoryId : undefined,
          taxCategory: wantsTax ? s.taxCategory : undefined,
          reason: suggestionLabel(s),
          apply: true,
        } as Proposal;
      })
      .filter((p): p is Proposal => p !== null)
      .sort((a, b) => b.expense.date.localeCompare(a.expense.date));
  }, [expenses, categories, businessMode]);

  const selected = proposals.filter((p) => !skip[p.expense.id]);
  const catName = (id?: string) => categories.find((c) => c.id === id)?.name ?? "—";

  const applyAll = async () => {
    setBusy(true);
    try {
      let n = 0;
      for (const p of selected) {
        await act.saveExpense({
          ...p.expense,
          categoryId: p.categoryId ?? p.expense.categoryId,
          taxCategory: p.taxCategory ?? p.expense.taxCategory,
        });
        n++;
      }
      toast(`Categorized ${n} expense${n === 1 ? "" : "s"}`);
      onClose();
    } catch (e) {
      toast((e as Error).message || "Couldn't apply changes", "clay");
    } finally { setBusy(false); }
  };

  return (
    <Modal title="Auto-categorize existing expenses" onClose={onClose} wide>
      <p style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 6 }}>
        Suggestions come from your own history first, then a table of common merchants.
        Untick anything you'd rather leave alone — nothing is saved until you apply.
      </p>

      {proposals.length === 0 ? (
        <Empty text="Nothing to suggest — every expense already has a category, and business expenses have a Schedule C line." />
      ) : (
        <>
          <div style={{ fontSize: 12.5, color: "var(--dim)", margin: "10px 0 6px" }}>
            <strong style={{ color: "var(--fern)" }}>{selected.length}</strong> of {proposals.length} will be updated
          </div>
          <div style={{ maxHeight: 340, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 9 }}>
            <table className="gl-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 32 }} /><th>Date</th><th>Merchant</th>
                  <th>Proposed</th><th style={{ textAlign: "right" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((p) => (
                  <tr key={p.expense.id}>
                    <td>
                      <input type="checkbox" checked={!skip[p.expense.id]}
                        aria-label={`Apply to ${p.expense.merchant || p.expense.title}`}
                        onChange={(e) => setSkip({ ...skip, [p.expense.id]: !e.target.checked })} />
                    </td>
                    <td className="gl-mono" style={{ color: "var(--dim)", whiteSpace: "nowrap" }}>{p.expense.date}</td>
                    <td>{p.expense.merchant || p.expense.title}</td>
                    <td style={{ fontSize: 12 }}>
                      {p.categoryId && <div>{catName(p.categoryId)}</div>}
                      {p.taxCategory && (
                        <div style={{ color: "var(--fern)" }}>
                          {TAX_LINE_BY_ID.get(p.taxCategory)?.label} (line {TAX_LINE_BY_ID.get(p.taxCategory)?.line})
                        </div>
                      )}
                      {p.reason && <div style={{ color: "var(--dim)", fontSize: 11 }}>{p.reason}</div>}
                    </td>
                    <td className="gl-mono" style={{ textAlign: "right" }}>{money(p.expense.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
            <button className="gl-btn" onClick={onClose}>Cancel</button>
            <button className="gl-btn primary" disabled={busy || selected.length === 0} onClick={applyAll}>
              <Check size={14} /> Apply {selected.length || ""}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Count of expenses the categorizer could improve — drives the prompt button. */
export function countCategorizable(expenses: Expense[], categories: Category[], businessMode: boolean): number {
  const index = buildMerchantIndex(expenses);
  const defaultCat = categories[0]?.id;
  let n = 0;
  for (const e of expenses) {
    const noCategory = !e.categoryId || !categories.some((c) => c.id === e.categoryId) || e.categoryId === defaultCat;
    const noTaxLine = businessMode && e.business && !e.taxCategory;
    if (!noCategory && !noTaxLine) continue;
    const s = suggestCategory(e.merchant || e.title, index, categories);
    if ((s.categoryId && s.categoryId !== e.categoryId) || (noTaxLine && s.taxCategory)) n++;
  }
  return n;
}
