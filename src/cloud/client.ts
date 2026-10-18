import { createClient } from "@supabase/supabase-js";

// Only the public anon key belongs here. The service_role / sb_secret_ key must never
// be used in this app: every VITE_ variable is copied into the public JavaScript bundle.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = Boolean(url && anonKey);

// Sign-in is an email code typed into the app, so nothing redirects and no tokens reach the
// URL. PKCE is not needed for that. It stays on because any future email link (for example
// confirming a changed address) would otherwise return tokens in the URL hash, which is
// this app's router (#/home).
export const supabase = url && anonKey
  ? createClient(url, anonKey, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;
