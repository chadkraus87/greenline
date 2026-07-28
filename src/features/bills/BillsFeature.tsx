import { useState } from "react";
import { Check, Copy, Pencil, Trash2, Pause, Play } from "lucide-react";
import type { Bill, Category, MonthModel, Priority } from "../../types";
import { Modal, Field, FormActions, ViewHeader, Empty } from "../../components/ui";
import { money, num, sanitize } from "../../lib/money";
import { MONTHS, parseYmd } from "../../lib/dates";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

export function BillForm({ initial, categories, onClose }: { initial?: Bill; categories: Category[]; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: initial?.name ?? "", amount: initial?.amount?.toString() ?? "",
    categoryId: initial?.categoryId ?? categories[0]?.id ?? "misc",
    dueDay: initial?.dueDay?.toString() ?? "1", priority: initial?.priority ?? ("normal" as Priority),
    notes: initial?.notes ?? "",
  });
  const save = async () => {
    await act.saveBill({
      id: initial?.id, name: sanitize(f.name), amount: num(f.amount),
      categoryId: f.categoryId, dueDay: Math.min(31, Math.max(1, parseInt(f.dueDay) || 1)),
      priority: f.priority, notes: sanitize(f.notes), paused: initial?.paused,
    });
    toast(initial ? "Bill updated" : "Bill added");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit bill" : "Add bill"} onClose={onClose}>
      <Field label="Bill name"><input className="gl-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Rent, Internet, Car insurance…" autoFocus /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Amount"><input className="gl-input gl-mono" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Due day of month"><input className="gl-input gl-mono" type="number" min="1" max="31" value={f.dueDay} onChange={(e) => setF({ ...f, dueDay: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Category">
          <select className="gl-select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select className="gl-select" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
            <option value="high">High</option><option value="normal">Normal</option><option value="low">Low</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><input className="gl-input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Add bill"} disabled={!f.name.trim() || !num(f.amount)} />
    </Modal>
  );
}

export function BillsView({ month, allBills, categories, search, onEdit, onUndoable }:
  { month: MonthModel; allBills: Bill[]; categories: Category[]; search: string; onEdit: (b: Bill) => void; onUndoable: (label: string, undo: act.UndoFn | null) => void }) {
  const toast = useToast();
  const today = parseYmd(month.todayYmd);
  const list = month.billOccs.filter((b) => b.name.toLowerCase().includes(search)).sort((a, b) => a.day - b.day);
  const pausedBills = allBills.filter((b) => b.paused && b.name.toLowerCase().includes(search));
  return (
    <div className="gl-card">
      <ViewHeader title="Bills" sub={`${money(month.billsPaidTotal)} paid of ${money(month.billsTotal)} due this month`} />
      {list.length === 0 && pausedBills.length === 0 && <Empty text="No bills yet. Add rent, utilities, subscriptions — anything recurring." />}
      {list.map((b) => {
        const cat = categories.find((c) => c.id === b.categoryId);
        const due = parseYmd(b.date);
        const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
        const when = b.isPaid ? "paid" : b.overdue ? `${Math.abs(diff)}d overdue` : diff === 0 ? "due today" : `due in ${diff}d`;
        return (
          <div className="gl-row" key={b.id}>
            <button className="gl-icon-btn" aria-label={b.isPaid ? "Mark unpaid" : "Mark paid"}
              onClick={() => act.toggleBillPaid(b.id, month.ym)}
              style={b.isPaid ? { background: "var(--fern)", color: "#fff", borderColor: "var(--fern)" } : undefined}>
              <Check size={14} />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500, textDecoration: b.isPaid ? "line-through" : "none", opacity: b.isPaid ? 0.65 : 1 }}>{b.name}</div>
              <div style={{ fontSize: 11.5, color: b.overdue ? "var(--clay)" : "var(--dim)" }}>
                {MONTHS[due.getMonth()].slice(0, 3)} {b.day} · {when}{cat ? ` · ${cat.name}` : ""}{b.priority === "high" ? " · high priority" : ""}
              </div>
            </div>
            <span className="gl-mono" style={{ fontWeight: 600 }}>{money(b.amount)}</span>
            <button className="gl-icon-btn" onClick={() => onEdit(b)} aria-label="Edit bill"><Pencil size={13} /></button>
            <button className="gl-icon-btn" onClick={() => act.togglePauseBill(b.id)} aria-label="Pause bill" title="Pause (skip all months until resumed)"><Pause size={13} /></button>
            <button className="gl-icon-btn" onClick={() => { act.duplicateBill(b.id); toast("Bill duplicated"); }} aria-label="Duplicate bill"><Copy size={13} /></button>
            <button className="gl-icon-btn" onClick={async () => onUndoable("Bill deleted", await act.deleteBill(b.id))} aria-label="Delete bill"><Trash2 size={13} /></button>
          </div>
        );
      })}
      {pausedBills.map((b) => (
        <div className="gl-row" key={b.id} style={{ opacity: 0.55 }}>
          <button className="gl-icon-btn" onClick={() => act.togglePauseBill(b.id)} aria-label="Resume bill" title="Resume"><Play size={13} /></button>
          <div style={{ flex: 1 }}>{b.name}<span style={{ fontSize: 11.5, color: "var(--dim)" }}> · paused</span></div>
          <span className="gl-mono">{money(b.amount)}</span>
        </div>
      ))}
    </div>
  );
}
