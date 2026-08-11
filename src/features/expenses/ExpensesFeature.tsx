import { useState } from "react";
import { Pencil, Trash2, ScanLine, Upload, Briefcase } from "lucide-react";
import type { Category, Expense, MonthModel } from "../../types";
import { Modal, Field, FormActions, ViewHeader, Empty } from "../../components/ui";
import { money, num, sanitize } from "../../lib/money";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";
import { ReceiptScanner, type ReceiptPrefill } from "./ReceiptScanner";
import { SCHEDULE_C, TAX_LINE_BY_ID } from "../../lib/tax";

export function ExpenseForm({ initial, categories, defaultDate, prefill, businessMode, onClose }:
  { initial?: Expense; categories: Category[]; defaultDate: string; prefill?: ReceiptPrefill;
    businessMode?: boolean; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: prefill?.title ?? initial?.title ?? "",
    amount: prefill?.amount ?? initial?.amount?.toString() ?? "",
    categoryId: prefill?.categoryId || initial?.categoryId || categories[0]?.id || "misc",
    date: prefill?.date || initial?.date || defaultDate,
    merchant: prefill?.merchant ?? initial?.merchant ?? "",
    notes: initial?.notes ?? "",
    business: initial?.business ?? prefill?.business ?? false,
    businessPct: (initial?.businessPct ?? prefill?.businessPct ?? 100).toString(),
    taxCategory: initial?.taxCategory ?? prefill?.taxCategory ?? "",
  });
  const receiptPath = prefill?.receiptPath ?? initial?.receiptPath;
  const deductible = f.business
    ? (num(f.amount) * Math.max(0, Math.min(100, parseFloat(f.businessPct) || 0)) / 100)
      * ((TAX_LINE_BY_ID.get(f.taxCategory)?.deductiblePct ?? 100) / 100)
    : 0;
  const save = async () => {
    await act.saveExpense({
      id: initial?.id, title: sanitize(f.title), amount: num(f.amount),
      categoryId: f.categoryId, date: f.date, merchant: sanitize(f.merchant), notes: sanitize(f.notes),
      receiptPath,
      business: f.business,
      businessPct: Math.max(0, Math.min(100, parseFloat(f.businessPct) || 100)),
      taxCategory: f.taxCategory || undefined,
    });
    toast(initial ? "Expense updated" : "Expense added");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit expense" : prefill ? "Confirm scanned receipt" : "Add expense"} onClose={onClose}>
      {prefill && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "9px 12px", borderRadius: 9,
          background: prefill.confidence === "high" ? "var(--fern-soft)" : "var(--brass-soft)", marginTop: 6, marginBottom: 4 }}>
          <ScanLine size={15} color={prefill.confidence === "high" ? "var(--fern)" : "var(--brass)"} style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5 }}>
            Read from your receipt ({prefill.confidence} confidence). <strong>Check the amount and date</strong> before saving — scanning isn't perfect.
          </div>
        </div>
      )}
      <Field label="Title"><input className="gl-input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Groceries, gas, coffee…" autoFocus /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Amount"><input className="gl-input gl-mono" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Date"><input className="gl-input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Category">
          <select className="gl-select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {prefill?.categorySource && (
            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>Auto-filled {prefill.categorySource} — change it if wrong</div>
          )}
        </Field>
        <Field label="Merchant"><input className="gl-input" value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><input className="gl-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>

      {businessMode && (
        <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13.5 }}>
            <input type="checkbox" checked={f.business} onChange={(e) => setF({ ...f, business: e.target.checked })} />
            <Briefcase size={14} /> Business expense
          </label>
          {f.business && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10, marginTop: 6 }}>
                <Field label="Schedule C category">
                  <select className="gl-select" value={f.taxCategory} onChange={(e) => setF({ ...f, taxCategory: e.target.value })}>
                    <option value="">— pick one —</option>
                    {SCHEDULE_C.map((l) => <option key={l.id} value={l.id}>{l.label} (line {l.line})</option>)}
                  </select>
                </Field>
                <Field label="Business use %">
                  <input className="gl-input gl-mono" type="number" min="0" max="100" step="1"
                    value={f.businessPct} onChange={(e) => setF({ ...f, businessPct: e.target.value })} />
                </Field>
              </div>
              {f.taxCategory && TAX_LINE_BY_ID.get(f.taxCategory)?.hint && (
                <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 2 }}>
                  {TAX_LINE_BY_ID.get(f.taxCategory)!.hint}
                </div>
              )}
              <div style={{ fontSize: 12.5, color: "var(--fern)", marginTop: 6 }}>
                Deductible: {money(deductible)}
                {TAX_LINE_BY_ID.get(f.taxCategory)?.deductiblePct === 50 && " — meals are 50% deductible"}
              </div>
              {!f.taxCategory && (
                <div style={{ fontSize: 11.5, color: "var(--brass)", marginTop: 4 }}>
                  Pick a category or this won't count toward your deductions.
                </div>
              )}
            </>
          )}
        </div>
      )}

      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Add expense"} disabled={!f.title.trim() || !num(f.amount) || !f.date} />
    </Modal>
  );
}

export function ExpensesView({ month, categories, allExpenses, search, onAdd, onEdit, onScanned, onImport, onUndoable }:
  { month: MonthModel; categories: Category[]; allExpenses: Expense[]; search: string; onAdd: () => void; onEdit: (e: Expense) => void;
    onScanned: (p: ReceiptPrefill) => void; onImport: () => void; onUndoable: (label: string, undo: act.UndoFn | null) => void }) {
  const list = month.expenses
    .filter((e) => `${e.title} ${e.merchant ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(search))
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="gl-card">
      <ViewHeader title="Expenses" sub={`${money(month.expensesTotal)} in day-to-day spending this month`} onAdd={onAdd} addLabel="Add expense" />
      <div style={{ padding: "0 14px 10px", display: "flex", gap: 8, flexWrap: "wrap" }}>
        <ReceiptScanner categories={categories} expenses={allExpenses} onScanned={onScanned} style={{ fontSize: 12 }} />
        <button className="gl-btn" style={{ fontSize: 12 }} onClick={onImport}>
          <Upload size={13} /> Import bank CSV
        </button>
      </div>
      {list.length === 0 && <Empty text="No expenses logged this month." />}
      {list.length > 0 && (
        <div style={{ overflowX: "auto" }}>
          <table className="gl-table">
            <thead><tr><th>Date</th><th>Expense</th><th>Category</th><th style={{ textAlign: "right" }}>Amount</th><th /></tr></thead>
            <tbody>
              {list.map((e) => {
                const cat = categories.find((c) => c.id === e.categoryId);
                return (
                  <tr key={e.id}>
                    <td className="gl-mono" style={{ color: "var(--dim)" }}>{e.date.slice(5)}</td>
                    <td>
                      {e.title}{e.merchant ? <span style={{ color: "var(--dim)" }}> · {e.merchant}</span> : ""}
                      {e.receiptPath && <ScanLine size={11} style={{ marginLeft: 5, verticalAlign: "middle", color: "var(--dim)" }} aria-label="Has receipt" />}
                    </td>
                    <td>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 99, background: cat?.color ?? "var(--dim)" }} />{cat?.name ?? "—"}
                      </span>
                    </td>
                    <td className="gl-mono" style={{ textAlign: "right", fontWeight: 600 }}>{money(e.amount)}</td>
                    <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                      <button className="gl-icon-btn" onClick={() => onEdit(e)} aria-label="Edit expense"><Pencil size={13} /></button>{" "}
                      <button className="gl-icon-btn" onClick={async () => onUndoable("Expense deleted", await act.deleteExpense(e.id))} aria-label="Delete expense"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
