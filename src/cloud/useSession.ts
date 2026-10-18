import { useEffect, useState } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "./client";

export type CloudUser = { id: string; email?: string };
export type Session =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signedOut"; error?: string }
  | { status: "signedIn"; user: CloudUser };

const OAUTH_PARAMS = ["code", "error", "error_code", "error_description"];
const signedIn = (session: AuthSession): Session => ({ status: "signedIn", user: { id: session.user.id, email: session.user.email } });

// A Google sign-in returns to /?code=... (or /?error=...). Remove these parameters once they
// are handled so a refresh doesn't replay them. The hash is left alone: it's the router.
function stripOAuthParams() {
  const url = new URL(window.location.href);
  if (!OAUTH_PARAMS.some(name => url.searchParams.has(name))) return;
  OAUTH_PARAMS.forEach(name => url.searchParams.delete(name));
  window.history.replaceState(null, "", url.pathname + url.search + url.hash);
}

export function useSession(): Session {
  const [session, setSession] = useState<Session>(() => supabase ? { status: "loading" } : { status: "unconfigured" });
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    // Read an OAuth error once (it is shown on the sign-in screen). The ?code= is left in place
    // until getSession has exchanged it.
    const params = new URL(window.location.href).searchParams;
    const urlError = params.get("error_description") ?? params.get("error") ?? undefined;
    if (!params.has("code")) stripOAuthParams();
    // getSession waits for any ?code= exchange to finish, so we never flash the sign-in screen mid-login.
    // It also reads the saved session, which works offline.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      setSession(data.session ? signedIn(data.session) : { status: "signedOut", error: urlError ?? error?.message });
      stripOAuthParams();
    });
    // Only set state here: calling Supabase from inside this callback can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ? signedIn(next) : { status: "signedOut" }));
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);
  return session;
}
