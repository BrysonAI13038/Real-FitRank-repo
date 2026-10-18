import { useEffect, useState } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import { supabase } from "./client";

export type CloudUser = { id: string; email?: string };
export type Session =
  | { status: "loading" }
  | { status: "unconfigured" }
  | { status: "signedOut"; error?: string }
  | { status: "signedIn"; user: CloudUser };

const signedIn = (session: AuthSession): Session => ({ status: "signedIn", user: { id: session.user.id, email: session.user.email } });

export function useSession(): Session {
  const [session, setSession] = useState<Session>(() => supabase ? { status: "loading" } : { status: "unconfigured" });
  useEffect(() => {
    if (!supabase) return;
    let live = true;
    // getSession reads the saved session (it works offline), so a signed-in user never flashes the sign-in screen.
    supabase.auth.getSession().then(({ data, error }) => {
      if (!live) return;
      setSession(data.session ? signedIn(data.session) : { status: "signedOut", error: error?.message });
    });
    // Only set state here: calling Supabase from inside this callback can deadlock.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next ? signedIn(next) : { status: "signedOut" }));
    return () => { live = false; data.subscription.unsubscribe(); };
  }, []);
  return session;
}
