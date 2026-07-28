import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Category, Expense, MonthModel } from "../../types";
import { Modal, Field, FormActions, ViewHeader, Empty } from "../../components/ui";
import { money, num, sanitize } from "../../lib/money";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

export function ExpenseForm({ initial, categories, defaultDate, onClose }:
  { initial?: Expense; categories: Category[]; defaultDate: string; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    title: initial?.title ?? "", amount: initial?.amount?.toString() ?? "",
    categoryId: initial?.categoryId ?? categories[0]?.id ?? "misc",
    date: initial?.date ?? defaultDate, merchant: initial?.merchant ?? "", notes: initial?.notes ?? "",
  });
  const save = async () => {
    await act.saveExpense({
      id: initial?.id, title: sanitize(f.title), amount: num(f.amount),
      categoryId: f.categoryId, date: f.date, merchant: sanitize(f.merchant), notes: sanitize(f.notes),
    });
    toast(initial ? "Expense updated" : "Expense added");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit expense" : "Add expense"} onClose={onClose}>
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
        </Field>
        <Field label="Merchant"><input className="gl-input" value={f.merchant} onChange={(e) => setF({ ...f, merchant: e.target.value })} /></Field>
      </div>
      <Field label="Notes"><input className="gl-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Add expense"} disabled={!f.title.trim() || !num(f.amount) || !f.date} />
    </Modal>
  );
}

export function ExpensesView({ month, categories, search, onAdd, onEdit, onUndoable }:
  { month: MonthModel; categories: Category[]; search: string; onAdd: () => void; onEdit: (e: Expense) => void; onUndoable: (label: string, undo: act.UndoFn | null) => void }) {
  const list = month.expenses
    .filter((e) => `${e.title} ${e.merchant ?? ""} ${e.notes ?? ""}`.toLowerCase().includes(search))
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <div className="gl-card">
      <ViewHeader title="Expenses" sub={`${money(month.expensesTotal)} in day-to-day spending this month`} onAdd={onAdd} addLabel="Add expense" />
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
                    <td>{e.title}{e.merchant ? <span style={{ color: "var(--dim)" }}> · {e.merchant}</span> : ""}</td>
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
