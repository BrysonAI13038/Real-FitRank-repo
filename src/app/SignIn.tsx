import { useEffect, useState } from "react";
import { supabase } from "../cloud/client";

// Apple sign-in stays hidden until the Apple provider is configured and tested.
const APPLE_ENABLED = import.meta.env.VITE_APPLE_SIGNIN === "on";

export default function SignIn({ error, unconfigured }: { error?: string; unconfigured?: boolean }) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error ?? "");
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);

  async function signIn(provider: "google" | "apple") {
    if (!supabase || busy) return;
    setBusy(true); setMessage("");
    const { error: failure } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: `${window.location.origin}/` } });
    if (failure) { setMessage("Couldn’t start sign-in. Check your connection and try again."); setBusy(false); }
  }

  return <section className="app-card app-signin" aria-labelledby="signin-title">
    <h2 id="signin-title">Sign in to FitRank</h2>
    <p>Your workouts and ELO are saved to your account, so they follow you to any device.</p>
    {unconfigured
      ? <p role="alert">Sign-in isn’t set up for this build yet.</p>
      : <>
        {!online && <p role="status">Connect to the internet to sign in.</p>}
        <button type="button" className="app-button" onClick={() => signIn("google")} disabled={!online || busy}>Continue with Google</button>
        {APPLE_ENABLED && <button type="button" className="app-button app-secondary" onClick={() => signIn("apple")} disabled={!online || busy}>Continue with Apple</button>}
      </>}
    {message && <p role="alert">{message}</p>}
    <p className="app-signin-note">We only receive your name and email from Google. Nothing is posted anywhere.</p>
  </section>;
}
