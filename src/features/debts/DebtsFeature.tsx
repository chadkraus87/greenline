import { useState } from "react";
import { Pencil, Trash2, TrendingDown } from "lucide-react";
import type { Debt, Settings } from "../../types";
import { Modal, Field, FormActions, ViewHeader, Empty, ColorPicker, PALETTE } from "../../components/ui";
import { money, num, sanitize } from "../../lib/money";
import { comparePayoff, type DebtPlan } from "../../lib/debt";
import { patchSettings } from "../../db/repo";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

export function DebtForm({ initial, onClose }: { initial?: Debt; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: initial?.name ?? "", balance: initial?.balance?.toString() ?? "",
    apr: initial?.apr?.toString() ?? "", minPayment: initial?.minPayment?.toString() ?? "",
    color: initial?.color ?? PALETTE[7],
  });
  const save = async () => {
    await act.saveDebt({
      id: initial?.id, name: sanitize(f.name), balance: num(f.balance),
      apr: Math.max(0, Math.min(100, parseFloat(f.apr) || 0)), minPayment: num(f.minPayment), color: f.color,
    });
    toast(initial ? "Debt updated" : "Debt added");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit debt" : "Add debt"} onClose={onClose}>
      <Field label="Debt name"><input className="gl-input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Visa, car loan, student loan…" autoFocus /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="Balance"><input className="gl-input gl-mono" type="number" min="0" step="0.01" value={f.balance} onChange={(e) => setF({ ...f, balance: e.target.value })} /></Field>
        <Field label="APR %"><input className="gl-input gl-mono" type="number" min="0" max="100" step="0.01" value={f.apr} onChange={(e) => setF({ ...f, apr: e.target.value })} /></Field>
        <Field label="Min / month"><input className="gl-input gl-mono" type="number" min="0" step="0.01" value={f.minPayment} onChange={(e) => setF({ ...f, minPayment: e.target.value })} /></Field>
      </div>
      <Field label="Color"><ColorPicker value={f.color} onChange={(c) => setF({ ...f, color: c })} /></Field>
      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Add debt"} disabled={!f.name.trim() || !num(f.balance)} />
    </Modal>
  );
}

function PlanCard({ plan, title, recommended }: { plan: DebtPlan; title: string; recommended: boolean }) {
  return (
    <div className="gl-card" style={{ padding: 14, borderColor: recommended ? "var(--fern)" : "var(--line)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span className="gl-display" style={{ fontSize: 15 }}>{title}</span>
        {recommended && <span style={{ fontSize: 11, color: "var(--fern)", fontWeight: 600 }}>recommended</span>}
      </div>
      {plan.feasible ? (
        <>
          <div className="gl-mono" style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>
            {plan.months} <span style={{ fontSize: 12, color: "var(--dim)" }}>months</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{money(plan.totalInterest)} total interest · {money(plan.totalPaid)} paid</div>
        </>
      ) : (
        <div style={{ fontSize: 12.5, color: "var(--clay)", marginTop: 8 }}>
          Payments don't cover the interest — add to your monthly budget to make progress.
        </div>
      )}
    </div>
  );
}

export function DebtsView({ debts, settings, onEdit, onUndoable }:
  { debts: Debt[]; settings: Settings; onEdit: (d: Debt) => void; onUndoable: (label: string, undo: act.UndoFn | null) => void }) {
  const total = debts.reduce((s, d) => s + d.balance, 0);
  const minTotal = debts.reduce((s, d) => s + d.minPayment, 0);
  const { avalanche, snowball } = comparePayoff(debts, settings.extraDebtBudget || 0);
  const avaBetter = avalanche.feasible && (!snowball.feasible || avalanche.totalInterest <= snowball.totalInterest);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div className="gl-card">
        <ViewHeader title="Debts" sub={`${money(total)} across ${debts.length} debt${debts.length === 1 ? "" : "s"} · ${money(minTotal)}/mo minimums`} />
        {debts.length === 0 && <Empty text="No debts tracked. Add balances and APRs to see snowball vs. avalanche payoff plans." />}
        {debts.map((d) => (
          <div className="gl-row" key={d.id}>
            <span style={{ width: 10, height: 10, borderRadius: 99, background: d.color, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 500 }}>{d.name}</div>
              <div style={{ fontSize: 11.5, color: "var(--dim)" }}>{d.apr}% APR · {money(d.minPayment)}/mo minimum</div>
            </div>
            <span className="gl-mono" style={{ fontWeight: 600 }}>{money(d.balance)}</span>
            <button className="gl-icon-btn" onClick={() => onEdit(d)} aria-label="Edit debt"><Pencil size={13} /></button>
            <button className="gl-icon-btn" onClick={async () => onUndoable("Debt deleted", await act.deleteDebt(d.id))} aria-label="Delete debt"><Trash2 size={13} /></button>
          </div>
        ))}
      </div>

      {debts.length > 0 && (
        <div className="gl-card" style={{ padding: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <TrendingDown size={16} color="var(--fern)" />
            <span className="gl-display" style={{ fontSize: 15 }}>Payoff plan</span>
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--dim)", marginBottom: 12 }}>
            Extra beyond minimums, per month
            <input className="gl-input gl-mono" type="number" min="0" step="10" defaultValue={settings.extraDebtBudget || ""}
              key={`edb-${settings.extraDebtBudget}`} placeholder="0.00" style={{ width: 110, padding: "5px 8px" }}
              onBlur={(e) => patchSettings({ extraDebtBudget: num(e.target.value) })} />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 12 }}>
            <PlanCard plan={avalanche} title="Avalanche (highest APR first)" recommended={avaBetter} />
            <PlanCard plan={snowball} title="Snowball (smallest balance first)" recommended={!avaBetter && snowball.feasible} />
          </div>
          {avalanche.feasible && snowball.feasible && avalanche.months !== Infinity && (
            <p style={{ fontSize: 12, color: "var(--dim)", marginBottom: 0, marginTop: 10 }}>
              Avalanche saves {money(Math.max(0, snowball.totalInterest - avalanche.totalInterest))} in interest;
              snowball clears individual balances faster for motivation. Same monthly budget either way.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
