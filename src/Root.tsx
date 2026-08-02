import App from "./App";
import { useAuth } from "./auth/AuthProvider";
import { AuthScreen } from "./auth/AuthScreen";
import { PendingScreen } from "./auth/PendingScreen";
import { isConfigured } from "./lib/supabase";

const Center = ({ children }: { children: React.ReactNode }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", color: "var(--dim)", padding: 20, textAlign: "center" }}>{children}</div>
);

/** Decides what to show based on auth + approval state. */
export function Root() {
  const { session, profile, loading } = useAuth();

  if (!isConfigured) {
    return <Center>Greenline isn’t configured yet — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then reload.</Center>;
  }
  if (loading) return <Center>Loading…</Center>;
  if (!session) return <AuthScreen />;
  if (!profile || profile.status !== "approved") return <PendingScreen />;
  return <App />;
}
