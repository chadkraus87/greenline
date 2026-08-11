import { useState } from "react";
import { ArrowUpCircle, X } from "lucide-react";
import { useAppUpdate } from "../pwa/useAppUpdate";

/**
 * Tells you when a newer build is cached and waiting. Deliberately not a toast:
 * toasts vanish after five seconds, and missing this one leaves you on a stale
 * app with no way to find out.
 */
export function UpdateBanner() {
  const { needRefresh, reload } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  if (!needRefresh || dismissed) return null;

  return (
    <div role="status" aria-live="polite"
      style={{
        // Top-centred: the toast stack owns bottom-centre, and a persistent
        // banner sitting under a pile of transient toasts is unreadable.
        position: "fixed", left: "50%", transform: "translateX(-50%)", top: 14, zIndex: 95,
        display: "flex", alignItems: "center", gap: 12, maxWidth: "calc(100vw - 32px)",
        padding: "10px 12px 10px 14px", borderRadius: 11,
        background: "var(--raised)", border: "1px solid var(--line)",
        boxShadow: "0 8px 28px rgba(0,0,0,.38)",
      }}>
      <ArrowUpCircle size={16} style={{ color: "var(--fern)", flexShrink: 0 }} />
      <span style={{ fontSize: 13 }}>A new version of Greenline is ready.</span>
      <button className="gl-btn primary" style={{ padding: "4px 10px", fontSize: 12.5 }} onClick={reload}>
        Reload
      </button>
      <button className="gl-icon-btn" aria-label="Dismiss until next time" title="Later"
        onClick={() => setDismissed(true)}>
        <X size={14} />
      </button>
    </div>
  );
}
