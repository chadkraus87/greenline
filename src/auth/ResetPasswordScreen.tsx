import { useState } from "react";
import { useAuth } from "./AuthProvider";

/** Shown after the user follows a password-reset link. */
export function ResetPasswordScreen() {
  const { updatePassword, signOut } = useAuth();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pw.length < 8) return setMsg("Use a password of at least 8 characters.");
    if (pw !== pw2) return setMsg("The two passwords don't match.");
    setBusy(true); setMsg(null);
    const { error } = await updatePassword(pw);
    setBusy(false);
    if (error) setMsg(error);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20 }}>
      <div className="gl-card" style={{ width: "min(380px, 100%)", padding: 28 }}>
        <div className="gl-display" style={{ fontSize: 20, color: "var(--fern)", marginBottom: 2 }}>Choose a new password</div>
        <div style={{ fontSize: 12.5, color: "var(--dim)", marginBottom: 18 }}>You're signed in from the reset link. Pick a new password to finish.</div>
        <form onSubmit={submit}>
          <label className="gl-label" htmlFor="gl-newpw">New password</label>
          <input id="gl-newpw" className="gl-input" type="password" autoComplete="new-password" required value={pw}
            onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" style={{ marginBottom: 10 }} />
          <label className="gl-label" htmlFor="gl-newpw2">Confirm new password</label>
          <input id="gl-newpw2" className="gl-input" type="password" autoComplete="new-password" required value={pw2}
            onChange={(e) => setPw2(e.target.value)} />
          {msg && <div style={{ color: "var(--clay)", fontSize: 12.5, marginTop: 10 }}>{msg}</div>}
          <button className="gl-btn primary" type="submit" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 16 }}>
            {busy ? "…" : "Save new password"}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <button className="gl-linkbtn" onClick={signOut}>Cancel and sign out</button>
        </div>
      </div>
    </div>
  );
}
