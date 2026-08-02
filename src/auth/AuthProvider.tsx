import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

export interface Profile { id: string; email: string; role: "admin" | "user"; status: "pending" | "approved" | "rejected"; }

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirm: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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
    session, profile, loading,
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
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
