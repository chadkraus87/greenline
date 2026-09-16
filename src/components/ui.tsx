import { createContext, useContext, useEffect, useRef, type ReactNode, type CSSProperties } from "react";
import { X, Plus } from "lucide-react";
import { DOW, MONTHS, pad } from "../lib/dates";

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Focus moves into the sheet and returns to whatever opened it — otherwise a
    // keyboard or screen-reader user is left stranded at the top of the page.
    const opener = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>("input,select,textarea,button:not([data-close])");
    (first ?? panel.current)?.focus({ preventScroll: true });
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", fn);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.({ preventScroll: true });
    };
  }, [onClose]);
  return (
    <div className="gl-modal-wrap" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} className={"gl-modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-labelledby="gl-modal-title">
        <div className="gl-modal-head">
          <h2 id="gl-modal-title" className="gl-display gl-modal-title">{title}</h2>
          <button className="gl-icon-btn" data-close onClick={onClose} aria-label="Close"><X aria-hidden size={18} /></button>
        </div>
        <div className="gl-modal-body">{children}</div>
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
    <div className="gl-card gl-stat">
      <div className="gl-stat-label">{label}</div>
      <div className="gl-mono gl-stat-value" style={{ color: tone ?? "var(--text)" }}>{value}</div>
      {sub && <div className="gl-stat-sub">{sub}</div>}
    </div>
  );
}

/** The current page's h1, so a card inside it doesn't repeat the same heading. */
export const PageTitleContext = createContext<string>("");

export function ViewHeader({ title, sub, onAdd, addLabel }: { title: string; sub?: string; onAdd?: () => void; addLabel?: string }) {
  // Most views open with a card titled exactly like the page. Under a page
  // heading that reads as a stutter, so the duplicate is dropped and the
  // summary line and action stay.
  const duplicate = useContext(PageTitleContext) === title;
  if (duplicate && !sub && !onAdd) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 18px 12px", gap: 12, flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        {!duplicate && <h2 className="gl-display" style={{ fontSize: 20 }}>{title}</h2>}
        {sub && <div style={{ fontSize: duplicate ? 14.5 : 13.5, color: duplicate ? "var(--text)" : "var(--dim)", marginTop: duplicate ? 0 : 2, fontWeight: duplicate ? 500 : 400 }}>{sub}</div>}
      </div>
      {onAdd && <button className="gl-btn primary" onClick={onAdd}><Plus size={16} aria-hidden /> {addLabel}</button>}
    </div>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="gl-empty">{text}</div>;
}

export function LiveClock({ now, clock24, onToggle }: { now: Date; clock24: boolean; onToggle: () => void }) {
  const h = now.getHours();
  const time = clock24
    ? `${pad(h)}:${pad(now.getMinutes())}`
    : `${((h + 11) % 12) + 1}:${pad(now.getMinutes())} ${h < 12 ? "AM" : "PM"}`;
  const style: CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "inherit", textAlign: "left", font: "inherit", padding: "4px 10px", borderRadius: 8 };
  return (
    <button onClick={onToggle} title="Switch between 12- and 24-hour time" aria-label={`${time}. Switch clock format`} style={style} className="gl-linkbtn-reset">
      <div className="gl-mono" style={{ fontSize: 15, fontWeight: 600 }}>{time}</div>
      <div style={{ fontSize: 12.5, color: "var(--dim)" }}>
        {DOW[now.getDay()]}, {MONTHS[now.getMonth()].slice(0, 3)} {now.getDate()}
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
