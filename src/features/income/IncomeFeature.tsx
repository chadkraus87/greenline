import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import type { Frequency, IncomeSource, MonthModel } from "../../types";
import { Modal, Field, FormActions, ViewHeader, Empty } from "../../components/ui";
import { money, num, sanitize } from "../../lib/money";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

const FREQS: { v: Frequency; l: string }[] = [
  { v: "monthly", l: "Monthly" }, { v: "biweekly", l: "Every 2 weeks" }, { v: "weekly", l: "Weekly" },
  { v: "quarterly", l: "Quarterly" }, { v: "annual", l: "Annual" }, { v: "once", l: "One-time" },
];

export function IncomeForm({ initial, defaultDate, onClose }: { initial?: IncomeSource; defaultDate: string; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: initial?.name ?? "", amount: initial?.amount?.toString() ?? "",
    frequency: initial?.frequency ?? ("biweekly" as Frequency), anchorDate: initial?.anchorDate ?? defaultDate,
    taxRate: initial?.taxRate?.toString() ?? "",
  });
  const save = async () => {
    const taxRate = Math.max(0, Math.min(100, parseFloat(f.taxRate) || 0));
    await act.saveIncome({ id: initial?.id, name: sanitize(f.name), amount: num(f.amount), frequency: f.frequency, anchorDate: f.anchorDate, taxRate: taxRate || undefined });
    toast(initial ? "Income updated" : "Income source added");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit income source" : "Add income source"} onClose={onClose}>
      <Field label="Source"><input className="gl-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Salary, freelance, side project…" autoFocus /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Amount per payment"><input className="gl-input gl-mono" type="number" min="0" step="0.01" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Frequency">
          <select className="gl-select" value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value as Frequency })}>
            {FREQS.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label={f.frequency === "monthly" ? "Pay day (any month, sets the day)" : "First / next payment date"}>
          <input className="gl-input" type="date" value={f.anchorDate} onChange={(e) => setF({ ...f, anchorDate: e.target.value })} />
        </Field>
        <Field label="Tax set-aside %">
          <input className="gl-input gl-mono" type="number" min="0" max="100" step="1" placeholder="0" value={f.taxRate}
            onChange={(e) => setF({ ...f, taxRate: e.target.value })} title="For untaxed / self-employment income — reserved from 'left to spend'" />
        </Field>
      </div>
      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Add income"} disabled={!f.name.trim() || !num(f.amount) || !f.anchorDate} />
    </Modal>
  );
}

export function IncomeView({ month, incomes, search, onEdit, onUndoable }:
  { month: MonthModel; incomes: IncomeSource[]; search: string; onEdit: (i: IncomeSource) => void; onUndoable: (label: string, undo: act.UndoFn | null) => void }) {
  const list = incomes.filter((i) => i.name.toLowerCase().includes(search));
  return (
    <div className="gl-card">
      <ViewHeader title="Income" sub={`${money(month.actualIncome)} received of ${money(month.expectedIncome)} expected this month`} />
      {list.length === 0 && <Empty text="No income sources yet. Add your paycheck to power the forecast." />}
      {list.map((inc) => {
        const occs = month.incomeOccs.filter((o) => o.sourceId === inc.id);
        return (
          <div className="gl-row" key={inc.id} style={{ alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{inc.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--dim)" }}>
                {money(inc.amount)} · {FREQS.find((x) => x.v === inc.frequency)?.l.toLowerCase()}
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {occs.map((o) => (
                  <button key={o.key} className="gl-btn"
                    style={{ padding: "3px 8px", fontSize: 11.5, ...(o.received ? { background: "var(--fern-soft)", color: "var(--fern)" } : {}) }}
                    onClick={() => act.toggleIncomeReceived(inc.id, o.date)}>
                    Day {o.day} {o.received ? "✓" : ""}
                  </button>
                ))}
                {occs.length === 0 && <span style={{ fontSize: 11.5, color: "var(--dim)" }}>No payments this month</span>}
              </div>
            </div>
            <span className="gl-mono" style={{ fontWeight: 600, color: "var(--fern)" }}>{money(occs.reduce((s, o) => s + o.amount, 0), true)}</span>
            <button className="gl-icon-btn" onClick={() => onEdit(inc)} aria-label="Edit income"><Pencil size={13} /></button>
            <button className="gl-icon-btn" onClick={async () => onUndoable("Income deleted", await act.deleteIncome(inc.id))} aria-label="Delete income"><Trash2 size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}
