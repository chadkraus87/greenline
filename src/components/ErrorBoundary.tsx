import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props { children: ReactNode; }
interface State { error: Error | null; }

/** Top-level safety net: a stray render error shows a recovery card instead of a
 *  white screen. Data lives in IndexedDB, so a reload is always safe. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Local-only app: log to the console for debugging, nothing leaves the device.
    console.error("Greenline crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
        <div className="gl-card" style={{ maxWidth: 460, padding: 24, textAlign: "center" }}>
          <div className="gl-display" style={{ fontSize: 20, color: "var(--clay)", marginBottom: 8 }}>Something went wrong</div>
          <p style={{ fontSize: 14, color: "var(--dim)", marginTop: 0 }}>
            Your data is safe — it's stored on this device and wasn't affected. Reloading usually fixes it.
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
