import { createClient } from "@supabase/supabase-js";

// Only the public anon key belongs here. The service_role / sb_secret_ key must never
// be used in this app: every VITE_ variable is copied into the public JavaScript bundle.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = Boolean(url && anonKey);

// PKCE, not the default implicit flow: the app routes with the URL hash (#/home),
// and the implicit flow would return tokens in that same hash.
export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
