import { useAuth } from "./AuthProvider";

/** Shown to a signed-in user whose account isn't approved yet. */
export function PendingScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const rejected = profile?.status === "rejected";
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 20 }}>
      <div className="gl-card" style={{ width: "min(420px, 100%)", padding: 28, textAlign: "center" }}>
        <div className="gl-display" style={{ fontSize: 20, color: rejected ? "var(--clay)" : "var(--brass)", marginBottom: 8 }}>
          {rejected ? "Access not granted" : "Awaiting approval"}
        </div>
        <p style={{ fontSize: 13.5, color: "var(--dim)", marginTop: 0 }}>
          {rejected
            ? "Your account wasn't approved for access. Contact the administrator if you think this is a mistake."
            : "Your account was created and is waiting for the administrator to approve it. You'll have access as soon as they do."}
        </p>
        <div style={{ fontSize: 12, color: "var(--dim)", marginBottom: 16 }}>Signed in as {profile?.email}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          {!rejected && <button className="gl-btn" onClick={refreshProfile}>Check again</button>}
          <button className="gl-btn" onClick={signOut}>Sign out</button>
        </div>
      </div>
    </div>
  );
}
