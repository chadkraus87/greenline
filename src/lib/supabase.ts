import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !key) {
  // Surfaced clearly in dev; in prod the build should always inject these.
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — copy .env.example to .env.");
}

export const supabase = createClient(url ?? "", key ?? "", {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const isConfigured = Boolean(url && key);
