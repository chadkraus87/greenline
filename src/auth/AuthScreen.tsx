import { useState } from "react";
import { useAuth } from "./AuthProvider";

/** Login / sign-up. New accounts land in a pending state until the admin approves. */
export function AuthScreen() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const [mode, setMode] = useState<"in" | "up" | "forgot">("in");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === "forgot") {
      const { error } = await sendPasswordReset(email.trim());
      if (error) setMsg(error);
      else setSent(true);
    } else if (mode === "in") {
      const { error } = await signIn(email.trim(), pw);
      if (error) setMsg(error);
    } else {
      if (pw.length < 8) { setMsg("Use a password of at least 8 characters."); setBusy(false); return; }
      const { error, needsConfirm } = await signUp(email.trim(), pw);
      if (error) setMsg(error);
      else if (needsConfirm) setConfirm(true);
    }
    setBusy(false);
  };

  if (sent) {
    return (
      <Shell>
        <div className="gl-display" style={{ fontSize: 20, marginBottom: 8 }}>Reset link sent</div>
        <p style={{ fontSize: 13.5, color: "var(--dim)" }}>
          If an account exists for <strong>{email.trim()}</strong>, a password-reset link is on its way. Open it in this browser to choose a new password.
        </p>
        <button className="gl-btn" style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
          onClick={() => { setSent(false); setMode("in"); }}>Back to sign in</button>
      </Shell>
    );
  }

  if (confirm) {
    return (
      <Shell>
        <div className="gl-display" style={{ fontSize: 20, marginBottom: 8 }}>Check your email</div>
        <p style={{ fontSize: 13.5, color: "var(--dim)" }}>
          Confirm your address from the link we sent, then wait for the admin to approve your account. You can close this tab.
        </p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="gl-display" style={{ fontSize: 22, color: "var(--fern)", marginBottom: 2 }}>Greenline</div>
      <div style={{ fontSize: 12.5, color: "var(--dim)", marginBottom: 18 }}>
        {mode === "in" ? "Sign in to your budget" : mode === "up" ? "Create an account" : "Reset your password"}
      </div>
      <form onSubmit={submit}>
        <label className="gl-label" htmlFor="gl-email">Email</label>
        <input id="gl-email" className="gl-input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} style={{ marginBottom: 10 }} />
        {mode !== "forgot" && (
          <>
            <label className="gl-label" htmlFor="gl-password">Password</label>
            <input id="gl-password" className="gl-input" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required value={pw} onChange={(e) => setPw(e.target.value)} placeholder={mode === "up" ? "At least 8 characters" : ""} />
          </>
        )}
        {msg && <div style={{ color: "var(--clay)", fontSize: 12.5, marginTop: 10 }}>{msg}</div>}
        <button className="gl-btn primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 16 }}>
          {busy ? "…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Email me a reset link"}
        </button>
      </form>
      {mode === "in" && (
        <div style={{ fontSize: 12.5, marginTop: 10, textAlign: "center" }}>
          <button className="gl-linkbtn" onClick={() => { setMode("forgot"); setMsg(null); }}>Forgot password?</button>
        </div>
      )}
      <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 14, textAlign: "center" }}>
        {mode === "forgot" ? (
          <button className="gl-linkbtn" onClick={() => { setMode("in"); setMsg(null); }}>Back to sign in</button>
        ) : (
          <>
            {mode === "in" ? "New here? " : "Have an account? "}
            <button className="gl-linkbtn" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
              {mode === "in" ? "Create an account" : "Sign in"}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20 }}>
      <div className="gl-card" style={{ width: "min(380px, 100%)", padding: 28 }}>{children}</div>
    </div>
  );
}
