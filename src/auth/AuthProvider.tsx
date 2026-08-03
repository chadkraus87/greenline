import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface Profile { id: string; email: string; role: "admin" | "user"; status: "pending" | "approved" | "rejected"; }

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /** True while the user is following a password-recovery link. */
  recovering: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
}

const Ctx = createContext<AuthState | null>(null);
export const useAuth = (): AuthState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth outside AuthProvider");
  return v;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Following a reset link signs the user in with a recovery session; hold
      // them on the "set a new password" screen until they choose one.
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const fetchProfile = useCallback(async (uid: string) => {
    const { data } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle();
    return (data as Profile) ?? null;
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!session) { setProfile(null); setLoading(false); return; }
      setLoading(true);
      const p = await fetchProfile(session.user.id);
      if (active) { setProfile(p); setLoading(false); }
    })();
    return () => { active = false; };
  }, [session, fetchProfile]);

  const value: AuthState = {
    session, profile, loading, recovering,
    signIn: async (email, password) => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return { error: error?.message ?? null };
    },
    signUp: async (email, password) => {
      const { data, error } = await supabase.auth.signUp({ email, password });
      return { error: error?.message ?? null, needsConfirm: !error && !data.session };
    },
    signOut: async () => { await supabase.auth.signOut(); },
    refreshProfile: async () => { if (session) setProfile(await fetchProfile(session.user.id)); },
    sendPasswordReset: async (email) => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      return { error: error?.message ?? null };
    },
    updatePassword: async (password) => {
      const { error } = await supabase.auth.updateUser({ password });
      if (!error) setRecovering(false);
      return { error: error?.message ?? null };
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
