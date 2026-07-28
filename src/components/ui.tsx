import { useEffect, type ReactNode, type CSSProperties } from "react";
import { X, Plus } from "lucide-react";
import { DOW, MONTHS, pad } from "../lib/dates";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
  return (
    <div className="gl-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="gl-modal" role="dialog" aria-modal="true" aria-label={title} style={wide ? { width: "min(640px,100%)" } : undefined}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", borderBottom: "1px solid var(--line)" }}>
          <span className="gl-display" style={{ fontSize: 17 }}>{title}</span>
          <button className="gl-icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        <div style={{ padding: "6px 18px 18px" }}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={{ display: "block" }}><span className="gl-label">{label}</span>{children}</label>;
}

export function FormActions({ onCancel, onSave, saveLabel, disabled }: { onCancel: () => void; onSave: () => void; saveLabel: string; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
      <button className="gl-btn" onClick={onCancel}>Cancel</button>
      <button className="gl-btn primary" disabled={disabled} onClick={onSave}>{saveLabel}</button>
    </div>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: string; tone?: string; sub?: string }) {
  return (
    <div className="gl-card" style={{ padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--dim)" }}>{label}</div>
      <div className="gl-mono" style={{ fontSize: 21, fontWeight: 600, marginTop: 3, color: tone ?? "var(--text)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--dim)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export function ViewHeader({ title, sub, onAdd, addLabel }: { title: string; sub?: string; onAdd?: () => void; addLabel?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 14px 10px", gap: 10, flexWrap: "wrap" }}>
      <div>
        <span className="gl-display" style={{ fontSize: 16 }}>{title}</span>
        {sub && <div style={{ fontSize: 12, color: "var(--dim)", marginTop: 2 }}>{sub}</div>}
      </div>
      {onAdd && <button className="gl-btn primary" onClick={onAdd}><Plus size={14} /> {addLabel}</button>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div style={{ padding: "18px 14px", fontSize: 13.5, color: "var(--dim)" }}>{text}</div>;
}

export function LiveClock({ now, clock24, onToggle }: { now: Date; clock24: boolean; onToggle: () => void }) {
  const h = now.getHours();
  const time = clock24
    ? `${pad(h)}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
    : `${((h + 11) % 12) + 1}:${pad(now.getMinutes())}:${pad(now.getSeconds())} ${h < 12 ? "AM" : "PM"}`;
  const style: CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "inherit", textAlign: "right", font: "inherit", padding: 0 };
  return (
    <button onClick={onToggle} title="Toggle 12 / 24-hour" aria-label="Toggle clock format" style={style}>
      <div className="gl-mono" style={{ fontSize: 17, fontWeight: 600 }}>{time}</div>
      <div style={{ fontSize: 11, color: "var(--dim)" }}>
        {DOW[now.getDay()]}, {MONTHS[now.getMonth()]} {now.getDate()}, {now.getFullYear()}
      </div>
    </button>
  );
}

export const PALETTE = ["#46B380","#D9A441","#5FA8D3","#C77DBA","#E0784C","#7A8FE0","#5BBFB0","#C4595E","#8FB35A","#B08968"];

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
      {PALETTE.map((c) => (
        <button key={c} onClick={() => onChange(c)} aria-label={`Color ${c}`}
          style={{ width: 24, height: 24, borderRadius: 7, background: c, cursor: "pointer", border: value === c ? "2px solid var(--text)" : "2px solid transparent" }} />
      ))}
    </div>
  );
}
