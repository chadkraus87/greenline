import { useState } from "react";
import { Pencil, Trash2, Car, Download } from "lucide-react";
import type { Mileage, Settings } from "../../types";
import { Modal, Field, FormActions, ViewHeader, Empty } from "../../components/ui";
import { money, num, sanitize } from "../../lib/money";
import { mileageCsvRows } from "../../lib/tax";
import { toCsv } from "../../lib/csv";
import * as act from "../../db/actions";
import { useToast } from "../../hooks/useToasts";

export function MileageForm({ initial, defaultDate, onClose }:
  { initial?: Mileage; defaultDate: string; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    date: initial?.date ?? defaultDate,
    miles: initial?.miles?.toString() ?? "",
    purpose: initial?.purpose ?? "",
    from: initial?.from ?? "",
    to: initial?.to ?? "",
  });
  const save = async () => {
    await act.saveMileage({
      id: initial?.id, date: f.date, miles: num(f.miles),
      purpose: sanitize(f.purpose), from: sanitize(f.from) || undefined, to: sanitize(f.to) || undefined,
    });
    toast(initial ? "Trip updated" : "Trip logged");
    onClose();
  };
  return (
    <Modal title={initial ? "Edit trip" : "Log a business trip"} onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Date"><input className="gl-input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Miles"><input className="gl-input gl-mono" type="number" min="0" step="0.1" value={f.miles} onChange={(e) => setF({ ...f, miles: e.target.value })} autoFocus /></Field>
      </div>
      <Field label="Business purpose">
        <input className="gl-input" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })}
          placeholder="Client session, job site visit, supply run…" />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="From (optional)"><input className="gl-input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To (optional)"><input className="gl-input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 6 }}>
        The IRS wants the date, miles, and business purpose for each trip — that's what makes the deduction defensible.
      </div>
      <FormActions onCancel={onClose} onSave={save} saveLabel={initial ? "Save changes" : "Log trip"}
        disabled={!f.purpose.trim() || !num(f.miles) || !f.date} />
    </Modal>
  );
}

export function MileageView({ entries, settings, year, onAdd, onEdit, onUndoable }:
  { entries: Mileage[]; settings: Settings; year: number; onAdd: () => void;
    onEdit: (m: Mileage) => void; onUndoable: (label: string, undo: act.UndoFn | null) => void }) {
  const toast = useToast();
  const rate = settings.mileageRate || 0;
  const thisYear = entries.filter((m) => m.date.startsWith(String(year)))
    .sort((a, b) => b.date.localeCompare(a.date));
  const miles = thisYear.reduce((s, m) => s + m.miles, 0);
  const deduction = miles * rate;

  const exportCsv = () => {
    const blob = new Blob([toCsv(mileageCsvRows(thisYear, rate))], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `greenline-mileage-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast("Mileage log downloaded");
  };

  return (
    <div className="gl-card">
      <ViewHeader title="Mileage" sub={`${year} business driving · ${rate ? `$${rate.toFixed(3)}/mile` : "set a rate in Settings"}`}
        onAdd={onAdd} addLabel="Log trip" />

      <div className="gl-stats" style={{ padding: "0 14px 12px" }}>
        <div className="gl-card" style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Miles</div>
          <div className="gl-mono" style={{ fontSize: 19, fontWeight: 600 }}>{miles.toLocaleString()}</div>
        </div>
        <div className="gl-card" style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Deduction</div>
          <div className="gl-mono" style={{ fontSize: 19, fontWeight: 600, color: "var(--fern)" }}>{money(deduction)}</div>
        </div>
        <div className="gl-card" style={{ padding: "10px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 600 }}>Trips</div>
          <div className="gl-mono" style={{ fontSize: 19, fontWeight: 600 }}>{thisYear.length}</div>
        </div>
      </div>

      <div style={{ padding: "0 14px 10px" }}>
        <button className="gl-btn" style={{ fontSize: 12 }} disabled={thisYear.length === 0} onClick={exportCsv}>
          <Download size={13} /> Export mileage log
        </button>
      </div>

      {thisYear.length === 0 ? (
        <Empty text="No trips logged this year. Standard mileage is usually the largest deduction for anyone driving to clients or job sites." />
      ) : thisYear.map((m) => (
        <div className="gl-row" key={m.id}>
          <Car size={15} color="var(--sky)" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 500 }}>{m.purpose}</div>
            <div style={{ fontSize: 11.5, color: "var(--dim)" }}>
              {m.date}{m.from || m.to ? ` · ${m.from ?? "?"} → ${m.to ?? "?"}` : ""}
            </div>
          </div>
          <span className="gl-mono" style={{ fontWeight: 600 }}>{m.miles} mi</span>
          <span className="gl-mono" style={{ color: "var(--fern)", fontSize: 12.5 }}>{money(m.miles * rate)}</span>
          <button className="gl-icon-btn" onClick={() => onEdit(m)} aria-label="Edit trip"><Pencil size={13} /></button>
          <button className="gl-icon-btn" aria-label="Delete trip"
            onClick={async () => onUndoable("Trip deleted", await act.deleteMileage(m.id))}><Trash2 size={13} /></button>
        </div>
      ))}

      {thisYear.length > 0 && (
        <p style={{ fontSize: 11.5, color: "var(--dim)", padding: "4px 14px 14px", margin: 0 }}>
          Standard mileage and actual vehicle costs (gas, repairs) are an either/or choice — claiming
          mileage here means not also deducting those costs on Schedule C line 9.
        </p>
      )}
    </div>
  );
}
