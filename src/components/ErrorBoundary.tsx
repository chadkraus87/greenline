import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/** Reload attempted once per tab, so a genuinely broken build can't loop. */
const RETRY_KEY = "gl-chunk-retry";

/**
 * A lazily-loaded view whose chunk is no longer on the server.
 *
 * Happens when a new build lands under a page that's still running the old
 * one: the service worker takes over and drops the old chunks, so opening
 * Tax or Reports asks for a file that isn't there any more. It's an update,
 * not a crash, and a reload is the actual fix.
 */
const isStaleChunk = (error: Error) =>
  /dynamically imported module|Importing a module script failed|ChunkLoadError|error loading dynamically imported/i
    .test(`${error.message}`);

/** Top-level safety net: a stray render error shows a recovery card instead of a
 *  white screen. Data lives in the user's account, so a reload is always safe. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (isStaleChunk(error) && !sessionStorage.getItem(RETRY_KEY)) {
      // Reload straight onto the new build rather than showing a crash card
      // for what is really "Greenline updated while you had this open".
      sessionStorage.setItem(RETRY_KEY, "1");
      window.location.reload();
      return;
    }
    console.error("Greenline crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (isStaleChunk(this.state.error)) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
          <div className="gl-card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
            <div className="gl-display" style={{ fontSize: 20, marginBottom: 8 }}>Greenline was updated</div>
            <p style={{ fontSize: 14, color: "var(--dim)", marginTop: 0 }}>
              This tab was running an older version. Reload to pick up the new one — nothing was lost.
            </p>
            <button className="gl-btn primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Reload Greenline</button>
          </div>
        </div>
      );
    }
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
        <div className="gl-card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <div className="gl-display" style={{ fontSize: 20, color: "var(--clay)", marginBottom: 8 }}>Something went wrong</div>
          <p style={{ fontSize: 14, color: "var(--dim)", marginTop: 0 }}>
            Your data is safe in your account and wasn't affected. Reloading usually fixes it.
          </p>
          <pre style={{ fontSize: 11, color: "var(--dim)", background: "var(--raised)", borderRadius: 8, padding: 10, overflowX: "auto", textAlign: "left" }}>
            {this.state.error.message}
          </pre>
          <button className="gl-btn primary" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>Reload Greenline</button>
        </div>
      </div>
    );
  }
}
