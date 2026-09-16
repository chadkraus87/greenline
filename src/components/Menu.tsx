import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A small dropdown for controls that don't earn permanent space in the header.
 *
 * Seven unlabelled icons in a row is a guessing game — the things people reach
 * for daily stay visible, and the rest move in here behind a label.
 */
export function Menu({ label, icon, badge, children, iconOnly, up, block }:
  { label: string; icon: ReactNode; badge?: number; children: (close: () => void) => ReactNode;
    /** Icon trigger for tight spaces; the label becomes its accessible name. */
    iconOnly?: boolean;
    /** Open upward — for a trigger pinned to the bottom of the sidebar. */
    up?: boolean;
    /** Stretch the trigger to its container's width. */
    block?: boolean }) {
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
      {iconOnly ? (
        <button className="gl-icon-btn" style={{ position: "relative" }} aria-label={badge ? `${label}, ${badge} pending` : label}
          aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {icon}
          {!!badge && badge > 0 && <span className="gl-badge" style={{ position: "absolute", top: 2, right: 2 }} aria-hidden>{badge}</span>}
        </button>
      ) : (
        <button className={block ? "gl-nav-item" : "gl-btn"} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {icon} <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
          {!!badge && badge > 0 && <span className="gl-badge" style={{ marginLeft: block ? "auto" : 2 }} aria-hidden>{badge}</span>}
        </button>
      )}
      {open && (
        <div role="menu" className={"gl-menu" + (up ? " up" : "")}>
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
      {!!badge && badge > 0 && <span className="gl-badge">{badge}</span>}
    </button>
  );
}
