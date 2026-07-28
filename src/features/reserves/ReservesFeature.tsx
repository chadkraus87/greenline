import { useState } from "react";
import { Pencil, Trash2, PiggyBank } from "lucide-react";
import type { Category, SinkingFund } from "../../types";
import { Modal, Field, FormActions, ViewHeader, Empty, ColorPicker, PALETTE } from "../../components/ui";
import { money, num, sanitize, round2 } from "../../lib/money";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

const CADENCES = [
  { v: 1, l: "Monthly" }, { v: 3, l: "Quarterly" }, { v: 6, l: "Twice a year" },
  { v: 12, l: "Yearly" }, { v: 24, l: "Every 2 years" },
];

export function SinkingFundForm({ initial, categories, defaultDate, onClose }:
  { initial?: SinkingFund; categories: Category[]; defaultDate: string; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: initial?.name ?? "", total: initial?.total?.toString() ?? "",
    cadenceMonths: initial?.cadenceMonths ?? 12, dueDate: initial?.dueDate ?? defaultDate,
    saved: initial?.saved?.toString() ?? "", categoryId: initial?.categoryId ?? "",
    color: initial?.color ?? PALETTE[4],
  });
  const monthly = num(f.total) > 0 && f.cadenceMonths > 0 ? round2(num(f.total) / f.cadenceMonths) : 0;
  const save = async () => {
    await act.saveSinkingFund({
      id: initial?.id, name: sanitize(f.name), total: num(f.total), cadenceMonths: f.cadenceMonths,
      dueDate: f.dueDate, saved: num(f.saved), categoryId: f.categoryId || undefined, color: f.color,
    });
    toast(initial ? "Reserve updated" : "Reserve added");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit reserve" : "Add sinking fund"} onClose={onClose}>
      <p style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 4 }}>
        For lumpy, irregular bills — insurance, property tax, registration. Greenline reserves a slice each month so the big bill never blindsides you.
      </p>
      <Field label="What it's for"><input className="gl-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Car insurance, property tax…" autoFocus /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Total amount due"><input className="gl-input gl-mono" type="number" min="0" step="0.01" value={f.total} onChange={(e) => setF({ ...f, total: e.target.value })} /></Field>
        <Field label="How often">
          <select className="gl-select" value={f.cadenceMonths} onChange={(e) => setF({ ...f, cadenceMonths: parseInt(e.target.value) })}>
            {CADENCES.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Next due date"><input className="gl-input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Already saved"><input className="gl-input gl-mono" type="number" min="0" step="0.01" value={f.saved} onChange={(e) => setF({ ...f, saved: e.target.value })} /></Field>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
        <Field label="Category (optional)">
          <select className="gl-select" value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
            <option value="">— none —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Color"><ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} /></Field>
      </div>
      <div style={{ fontSize: 12.5, color: "var(--fern)", marginTop: 8 }}>Reserves {money(monthly)} / month</div>
      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Add reserve"} disabled={!f.name.trim() || !num(f.total)} />
    </Modal>
  );
}

export function ReservesView({ funds, onAdd, onEdit, onUndoable }:
  { funds: SinkingFund[]; onAdd: () => void; onEdit: (f: SinkingFund) => void; onUndoable: (label: string, undo: act.UndoFn | null) => void }) {
  const toast = useToast();
  const totalMonthly = funds.reduce((s, f) => s + (f.cadenceMonths > 0 ? f.total / f.cadenceMonths : 0), 0);
  return (
    <div className="gl-card">
      <ViewHeader title="Sinking funds" sub={`Reserving ${money(round2(totalMonthly))}/month for irregular bills`} onAdd={onAdd} addLabel="Add reserve" />
      {funds.length === 0 && <Empty text="No reserves yet. Add annual insurance, property tax, or holidays so they never blow up a single month." />}
      {funds.map((f) => {
        const monthly = f.cadenceMonths > 0 ? round2(f.total / f.cadenceMonths) : 0;
        const pct = f.total > 0 ? Math.min(100, (f.saved / f.total) * 100) : 0;
        return (
          <div className="gl-row" key={f.id}>
            <PiggyBank size={16} color={f.color} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                <span style={{ fontWeight: 500 }}>{f.name}</span>
                <span className="gl-mono" style={{ color: "var(--dim)" }}>{money(f.saved)} / {money(f.total)}{pct >= 100 ? " · ready 🎉" : ""}</span>
              </div>
              <div className="gl-track" style={{ marginTop: 5 }}><div className="gl-fill" style={{ width: `${pct}%`, background: f.color }} /></div>
              <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 3 }}>{money(monthly)}/mo · due {f.dueDate}</div>
            </div>
            <button className="gl-btn" style={{ padding: "4px 9px", fontSize: 12 }} onClick={() => { act.contributeToSinkingFund(f.id); toast("Contribution logged"); }}>+{money(monthly)}</button>
            <button className="gl-icon-btn" onClick={() => onEdit(f)} aria-label="Edit reserve"><Pencil size={13} /></button>
            <button className="gl-icon-btn" onClick={async () => onUndoable("Reserve deleted", await act.deleteSinkingFund(f.id))} aria-label="Delete reserve"><Trash2 size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}
