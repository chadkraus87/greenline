import { useState } from "react";
import { Pencil, Trash2, AlertTriangle, Wand2 } from "lucide-react";
import type { Category, MonthModel } from "../../types";
import { Modal, Field, ViewHeader, Empty, ColorPicker, PALETTE } from "../../components/ui";
import { money, num, sanitize } from "../../lib/money";
import { burnPace } from "../../lib/insights";
import { patchSettings } from "../../db/repo";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

// Categories treated as "wants" for the 50/30/20 guide; everything else is a "need".
const WANTS = new Set(["entertainment", "misc"]);

export function CategoryForm({ initial, categories, onClose }:
  { initial?: Category; categories: Category[]; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({ name: initial?.name ?? "", color: initial?.color ?? PALETTE[0], limit: initial?.limit?.toString() ?? "" });
  const save = async () => {
    if (initial) await act.updateCategory(initial.id, { name: sanitize(f.name), color: f.color, limit: num(f.limit) });
    else await act.addCategory({ name: sanitize(f.name), color: f.color, limit: num(f.limit) });
    toast(initial ? "Category updated" : "Category added");
    onClose();
  };
  const del = async () => {
    if (!initial) return;
    const fallback = categories.find((c) => c.id !== initial.id);
    if (!fallback) return toast("Keep at least one category", "brass");
    await act.deleteCategory(initial.id, fallback.id);
    toast(`Deleted — its bills & expenses moved to ${fallback.name}`);
    onClose();
  };
  return (
    <Modal title={initial ? "Edit category" : "Add category"} onClose={onClose}>
      <Field label="Name"><input className="gl-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Groceries, Subscriptions…" autoFocus /></Field>
      <Field label="Monthly limit (optional)"><input className="gl-input gl-mono" type="number" min="0" step="0.01" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} /></Field>
      <Field label="Color"><ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} /></Field>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16 }}>
        {initial ? <button className="gl-btn" style={{ color: "var(--clay)", borderColor: "var(--clay)" }} onClick={del}><Trash2 size={13} /> Delete</button> : <span />}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="gl-btn" onClick={onClose}>Cancel</button>
          <button className="gl-btn primary" disabled={!f.name.trim()} onClick={save}>{initial ? "Save" : "Add category"}</button>
        </div>
      </div>
    </Modal>
  );
}

export function BudgetsView({ month, categories, elapsedPct, rollover, rolloverOn, onAddCategory, onEditCategory }:
  { month: MonthModel; categories: Category[]; elapsedPct: number; rollover: Record<string, number>; rolloverOn: boolean;
    onAddCategory: () => void; onEditCategory: (c: Category) => void }) {
  const toast = useToast();
  const pace = burnPace(month, categories, elapsedPct);

  const apply503020 = async () => {
    const income = month.expectedIncome;
    if (income <= 0) return toast("Add income first to use the 50/30/20 guide", "brass");
    const needs = categories.filter((c) => !WANTS.has(c.id));
    const wants = categories.filter((c) => WANTS.has(c.id));
    const perNeed = needs.length ? (income * 0.5) / needs.length : 0;
    const perWant = wants.length ? (income * 0.3) / wants.length : 0;
    await Promise.all([
      ...needs.map((c) => act.setCategoryLimit(c.id, Math.round(perNeed))),
      ...wants.map((c) => act.setCategoryLimit(c.id, Math.round(perWant))),
    ]);
    toast("Applied 50/30/20 guide — tune any category as needed");
  };

  return (
    <div className="gl-card">
      <ViewHeader title="Category budgets" sub="Set a monthly limit per category; spending tracks bills paid + expenses" onAdd={onAddCategory} addLabel="Add category" />

      {pace.length > 0 && (
        <div style={{ margin: "0 14px 10px", padding: "9px 12px", borderRadius: 9, background: "var(--clay-soft)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <AlertTriangle size={15} color="var(--clay)" style={{ flexShrink: 0, marginTop: 1 }} />
          <div style={{ fontSize: 12.5 }}>
            <strong>Spending ahead of pace</strong> ({pace[0].elapsedPct}% of the month elapsed):{" "}
            {pace.map((p) => `${p.name} (${p.spentPct}%)`).join(", ")}.
          </div>
        </div>
      )}

      <div style={{ padding: "0 14px 10px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="gl-btn" style={{ fontSize: 12 }} onClick={apply503020}><Wand2 size={13} /> Apply 50/30/20 guide</button>
        <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--dim)", cursor: "pointer" }}
          title="Envelope budgeting: unspent budget carries into next month">
          <input type="checkbox" checked={rolloverOn} onChange={(e) => patchSettings({ rolloverBudgets: e.target.checked })} />
          Roll unspent budget into next month
        </label>
      </div>

      {categories.length === 0 && <Empty text="No categories. Add one to start budgeting." />}
      {categories.map((c) => {
        const spent = month.catSpend[c.id] || 0;
        const carry = rolloverOn ? (rollover[c.id] || 0) : 0;
        const effective = c.limit + carry;
        const pct = effective > 0 ? Math.min(100, (spent / effective) * 100) : 0;
        const over = effective > 0 && spent > effective;
        return (
          <div className="gl-row" key={c.id}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: c.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                <span style={{ fontWeight: 500 }}>{c.name}</span>
                <span className="gl-mono" style={{ color: over ? "var(--clay)" : "var(--dim)" }}>
                  {money(spent)}{effective > 0 ? ` / ${money(effective)}` : ""}
                </span>
              </div>
              {effective > 0 && (
                <div className="gl-track" style={{ marginTop: 5 }}>
                  <div className="gl-fill" style={{ width: `${pct}%`, background: over ? "var(--clay)" : c.color }} />
                </div>
              )}
              {carry > 0 && (
                <div style={{ fontSize: 11, color: "var(--fern)", marginTop: 3 }}>
                  {money(c.limit)} budget + {money(carry)} rolled over
                </div>
              )}
            </div>
            <input key={`${c.id}-${c.limit}`} className="gl-input gl-mono" type="number" min="0" placeholder="limit" defaultValue={c.limit || ""}
              aria-label={`Monthly limit for ${c.name}`}
              onBlur={(e) => act.setCategoryLimit(c.id, num(e.target.value))}
              style={{ width: 88, padding: "5px 8px", fontSize: 12.5 }} />
            <button className="gl-icon-btn" onClick={() => onEditCategory(c)} aria-label={`Edit ${c.name}`}><Pencil size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}
