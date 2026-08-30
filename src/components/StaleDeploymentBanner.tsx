import { AlertTriangle } from "lucide-react";

/**
 * Warns when the app is being viewed on a frozen per-deployment URL.
 *
 * Vercel gives every deployment a permanent URL of its own. Bookmark one and
 * it serves that exact build forever — reloading, signing out, and clearing
 * caches all change nothing, because nothing is stale: it is a different,
 * pinned copy of the app. It cost a lot of time to spot from the inside, so
 * the app now says so itself.
 */
const CANONICAL_HOST =
  import.meta.env.VITE_CANONICAL_HOST || "greenline-chadwick-kraus-projects.vercel.app";

/** Only judges Vercel hosts — localhost and a custom domain are left alone. */
export function isPinnedDeployment(host: string, canonical = CANONICAL_HOST): boolean {
  if (!host.endsWith(".vercel.app")) return false;
  return host !== canonical;
}

export function StaleDeploymentBanner() {
  if (typeof window === "undefined" || !isPinnedDeployment(window.location.host)) return null;
  const url = `https://${CANONICAL_HOST}${window.location.pathname}`;

  return (
    <div role="alert" style={{
      display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      padding: "10px 14px", marginBottom: 12, borderRadius: 10,
      background: "var(--brass-soft)", border: "1px solid var(--brass)",
    }}>
      <AlertTriangle size={16} color="var(--brass)" style={{ flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 240, fontSize: 12.5 }}>
        <strong>This is a pinned copy of an older build.</strong>
        <div style={{ color: "var(--dim)" }}>
          This address always serves one fixed version, so it never updates. Your data is
          fine — open the live app to get the current one.
        </div>
      </div>
      <a className="gl-btn primary" style={{ fontSize: 12.5, textDecoration: "none" }} href={url}>
        Open the live app
      </a>
    </div>
  );
}
