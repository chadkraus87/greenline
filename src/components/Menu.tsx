import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A small dropdown for controls that don't earn permanent space in the header.
 *
 * Seven unlabelled icons in a row is a guessing game — the things people reach
 * for daily stay visible, and the rest move in here behind a label.
 */
export function Menu({ label, icon, badge, children }:
  { label: string; icon: ReactNode; badge?: number; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button className="gl-btn" style={{ fontSize: 12.5, padding: "5px 10px", position: "relative" }}
        aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {icon} {label}
        {!!badge && badge > 0 && (
          <span style={{ position: "absolute", top: -5, right: -5, minWidth: 15, height: 15, borderRadius: 99,
            background: "var(--brass)", color: "#fff", fontSize: 9.5, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{badge}</span>
        )}
      </button>
      {open && (
        <div role="menu" className="gl-menu">
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({ icon, children, onClick, badge }:
  { icon: ReactNode; children: ReactNode; onClick: () => void; badge?: number }) {
  return (
    <button role="menuitem" className="gl-menu-item" onClick={onClick}>
      {icon}
      <span style={{ flex: 1, textAlign: "left" }}>{children}</span>
      {!!badge && badge > 0 && (
        <span style={{ minWidth: 16, height: 16, borderRadius: 99, background: "var(--brass)", color: "#fff",
          fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center",
          padding: "0 4px" }}>{badge}</span>
      )}
    </button>
  );
}
