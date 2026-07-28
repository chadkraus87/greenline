import { useState } from "react";
import { Pencil, PiggyBank, Trash2 } from "lucide-react";
import type { Goal } from "../../types";
import { Modal, Field, FormActions, ViewHeader, Empty, ColorPicker, PALETTE } from "../../components/ui";
import { money, num, sanitize } from "../../lib/money";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

export function GoalForm({ initial, onClose }: { initial?: Goal; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: initial?.name ?? "", target: initial?.target?.toString() ?? "",
    saved: initial?.saved?.toString() ?? "", monthly: initial?.monthly?.toString() ?? "",
    color: initial?.color ?? PALETTE[2],
  });
  const save = async () => {
    await act.saveGoal({ id: initial?.id, name: sanitize(f.name), target: num(f.target), saved: num(f.saved), monthly: num(f.monthly), color: f.color });
    toast(initial ? "Goal updated" : "Goal added");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit goal" : "Add savings goal"} onClose={onClose}>
      <Field label="Goal"><input className="gl-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Emergency fund, vacation, new Mac…" autoFocus /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Target amount"><input className="gl-input gl-mono" type="number" min="0" value={f.target} onChange={(e) => setF({ ...f, target: e.target.value })} /></Field>
        <Field label="Saved so far"><input className="gl-input gl-mono" type="number" min="0" value={f.saved} onChange={(e) => setF({ ...f, saved: e.target.value })} /></Field>
      </div>
      <Field label="Monthly contribution"><input className="gl-input gl-mono" type="number" min="0" value={f.monthly} onChange={(e) => setF({ ...f, monthly: e.target.value })} /></Field>
      <Field label="Color"><ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} /></Field>
      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Add goal"} disabled={!f.name.trim() || !num(f.target)} />
    </Modal>
  );
}

export function GoalsView({ goals, onEdit, onUndoable }:
  { goals: Goal[]; onEdit: (g: Goal) => void; onUndoable: (label: string, undo: act.UndoFn | null) => void }) {
  const toast = useToast();
  return (
    <div className="gl-card">
      <ViewHeader title="Savings goals" sub="Monthly contributions are reserved in your remaining-budget math" />
      {goals.length === 0 && <Empty text="No goals yet. Emergency fund first — future you says thanks." />}
      {goals.map((g) => {
        const pct = g.target > 0 ? Math.min(100, (g.saved / g.target) * 100) : 0;
        const monthsLeft = g.monthly > 0 ? Math.ceil(Math.max(0, g.target - g.saved) / g.monthly) : null;
        return (
          <div className="gl-row" key={g.id}>
            <PiggyBank size={16} color={g.color} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5 }}>
                <span style={{ fontWeight: 500 }}>{g.name}</span>
                <span className="gl-mono" style={{ color: "var(--dim)" }}>
                  {money(g.saved)} / {money(g.target)}
                  {monthsLeft !== null && pct < 100 ? ` · ~${monthsLeft} mo left` : pct >= 100 ? " · funded 🎉" : ""}
                </span>
              </div>
              <div className="gl-track" style={{ marginTop: 5 }}>
                <div className="gl-fill" style={{ width: `${pct}%`, background: g.color }} />
              </div>
            </div>
            <button className="gl-btn" style={{ padding: "4px 9px", fontSize: 12 }} disabled={!g.monthly}
              onClick={() => { act.contributeToGoal(g.id); toast("Contribution logged"); }}>
              +{money(g.monthly || 0)}
            </button>
            <button className="gl-icon-btn" onClick={() => onEdit(g)} aria-label="Edit goal"><Pencil size={13} /></button>
            <button className="gl-icon-btn" onClick={async () => onUndoable("Goal deleted", await act.deleteGoal(g.id))} aria-label="Delete goal"><Trash2 size={13} /></button>
          </div>
        );
      })}
    </div>
  );
}
