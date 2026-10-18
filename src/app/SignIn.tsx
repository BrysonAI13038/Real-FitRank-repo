import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "../cloud/client";
import {
  CODE_LENGTH, cleanCode, clearPending, isCompleteCode, isExpired, isValidEmail, loadPending, normalizeEmail,
  savePending, secondsUntilResend, sendErrorMessage, verifyErrorMessage, EXPIRED_MESSAGE, type Pending,
} from "../cloud/otp";
import { signInMethods } from "../cloud/signInMethods";

// Which methods appear is decided at build time (VITE_GOOGLE_SIGNIN / VITE_EMAIL_SIGNIN).
// Google is the default. The email-code flow (type your email, then the 6-digit code we send)
// is kept behind its own flag; it never leaves the app, so it also works when installed.
const methods = signInMethods(import.meta.env);

export default function SignIn({ error, unconfigured }: { error?: string; unconfigured?: boolean }) {
  const [pending, setPending] = useState<Pending | null>(() => methods.email ? loadPending(localStorage, Date.now()) : null);
  const [email, setEmail] = useState(pending?.email ?? "");
  const [code, setCode] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [online, setOnline] = useState(() => navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(error ?? "");
  const emailField = useRef<HTMLInputElement>(null);
  const codeField = useRef<HTMLInputElement>(null);
  const step = pending ? "code" : "email";

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  // Ticks while waiting for a code, for the resend countdown and the expiry.
  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [pending]);
  // Move focus into the email flow, but don't pull it off the Google button when both are shown.
  useEffect(() => { if (step === "code") codeField.current?.focus(); else if (!methods.google) emailField.current?.focus(); }, [step]);

  const expired = pending ? isExpired(pending.sentAt, now) : false;
  const wait = pending ? secondsUntilResend(pending.sentAt, now) : 0;

  async function signInWithGoogle() {
    if (!supabase || busy) return;
    setBusy(true); setMessage("");
    const { error: failure } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/` } });
    if (failure) { setMessage("Couldn’t start sign-in. Check your connection and try again."); setBusy(false); }
  }
  async function sendCode(event?: FormEvent) {
    event?.preventDefault();
    if (!supabase || busy) return;
    const address = normalizeEmail(email);
    if (!isValidEmail(address)) { setMessage("Enter a valid email address."); return; }
    setBusy(true); setMessage("");
    const { error: failure } = await supabase.auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
    setBusy(false);
    if (failure) { setMessage(sendErrorMessage(failure)); return; }
    const sent = { email: address, sentAt: Date.now() };
    savePending(localStorage, sent);
    setEmail(address); setCode(""); setNow(sent.sentAt); setPending(sent);
  }
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !pending || busy) return;
    if (!isCompleteCode(code)) { setMessage(`Enter the ${CODE_LENGTH}-digit code from the email.`); return; }
    setBusy(true); setMessage("");
    const { error: failure } = await supabase.auth.verifyOtp({ email: pending.email, token: code, type: "email" });
    setBusy(false);
    // On success the session arrives through onAuthStateChange and this screen is replaced.
    if (failure) { setMessage(verifyErrorMessage(failure, pending.sentAt, Date.now())); codeField.current?.focus(); }
    else clearPending(localStorage);
  }
  function changeEmail() {
    clearPending(localStorage);
    setPending(null); setCode(""); setMessage("");
  }

  return <section className="app-card app-signin" aria-labelledby="signin-title">
    <h2 id="signin-title">Sign in to FitRank</h2>
    <p>Your workouts and ELO are saved to your account, so they follow you to any device.{methods.email && !methods.google && " No password needed: we email you a code."}</p>
    {unconfigured || (!methods.google && !methods.email) ? <p role="alert">Sign-in isn’t set up for this build yet.</p> : <>
      {!online && <p role="status">Connect to the internet to sign in.</p>}
      {methods.google && <button type="button" className="app-button" onClick={signInWithGoogle} disabled={!online || busy}>Continue with Google</button>}
      {methods.google && methods.email && <p className="app-signin-or" aria-hidden="true">or</p>}
      {methods.email && (step === "email" ? <form className="app-signin-form" onSubmit={sendCode} noValidate>
        <label htmlFor="signin-email">Email</label>
        <input id="signin-email" ref={emailField} className="app-input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} />
        <button type="submit" className="app-button" disabled={!online || busy || !email.trim()}>{busy ? "Sending…" : "Send code"}</button>
      </form> : <form className="app-signin-form" onSubmit={verify} noValidate>
        <p role="status">We sent a {CODE_LENGTH}-digit code to <strong>{pending?.email}</strong>. It can take a minute to arrive; check spam too.</p>
        <label htmlFor="signin-code">{CODE_LENGTH}-digit code</label>
        <input id="signin-code" ref={codeField} className="app-input app-code" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={CODE_LENGTH + 3} spellCheck={false} value={code} onChange={event => setCode(cleanCode(event.target.value))} />
        {expired && <p role="alert">{EXPIRED_MESSAGE}</p>}
        <button type="submit" className="app-button" disabled={!online || busy || expired || code.length !== CODE_LENGTH}>{busy ? "Signing in…" : "Sign in"}</button>
        <div className="app-signin-links">
          <button type="button" className="app-button app-secondary" onClick={() => void sendCode()} disabled={!online || busy || wait > 0}>{wait > 0 ? `Send a new code in ${wait}s` : "Send a new code"}</button>
          <button type="button" className="app-button app-secondary" onClick={changeEmail} disabled={busy}>Use a different email</button>
        </div>
      </form>)}
    </>}
    {message && message !== EXPIRED_MESSAGE && <p role="alert">{message}</p>}
    <p className="app-signin-note">FitRank uses only your email address to sign you in. Nothing is posted anywhere.</p>
  </section>;
}
