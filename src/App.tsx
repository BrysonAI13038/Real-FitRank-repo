import { useCallback, useEffect, useRef, useState } from "react";
import WorkoutLogger from "./workout/WorkoutLogger";
import { useWorkoutData } from "./app/data";
import { Home, Workouts, Progress, Food, Settings } from "./app/pages";
import "./app/app.css";
import Introduction from "./app/Introduction";
import SignIn from "./app/SignIn";
import ImportPrompt from "./app/ImportPrompt";
import Privacy from "./app/Privacy";
import Terms from "./app/Terms";
import { hasSeenIntroduction, completeIntroduction } from "./app/introductionPreference";
import { AccountProvider } from "./cloud/account";
import { useAccount } from "./cloud/accountContext";
import { useSession } from "./cloud/useSession";

const navigation = ["Home", "Workouts", "Progress", "Food", "Settings"] as const;
function route() {
  const value = window.location.hash.replace(/^#\//, "");
  return [...navigation.map(item => item.toLowerCase()), "log-workout", "privacy", "terms"].includes(value) ? value : "home";
}

// Everything that needs an account: loads this account's data and syncs it.
function SignedInPages({ page }: { page: string }) {
  const { storage, dataVersion, syncNow } = useAccount();
  const { data, error, refresh } = useWorkoutData(storage);
  useEffect(() => {
    window.addEventListener("hashchange", refresh);
    return () => window.removeEventListener("hashchange", refresh);
  }, [refresh]);
  useEffect(() => { refresh(); }, [dataVersion, refresh]);
  // A workout or goal was saved: show it now, then sync it to the account.
  const changed = useCallback(() => { refresh(); syncNow(); }, [refresh, syncNow]);
  return <>
    <ImportPrompt />
    {error && <div className="app-card app-error" role="alert"><p>{error}</p><button className="app-button app-secondary" onClick={refresh}>Try again</button></div>}
    {page === "food" ? <Food /> : page === "settings" ? <Settings data={data} /> : page === "log-workout" ? <div className="app-logger"><WorkoutLogger onSaved={changed} onBack={() => { refresh(); window.location.hash = "/home"; }} /></div> : data ? <>
      {page === "home" && <Home data={data} />}
      {page === "workouts" && <Workouts data={data} />}
      {page === "progress" && <Progress data={data} onChange={changed} />}
    </> : !error && <p role="status">Loading your workouts…</p>}
  </>;
}

export default function App() {
  const [page, setPage] = useState(route);
  const [showIntroduction, setShowIntroduction] = useState(() => !hasSeenIntroduction());
  const [introductionNotice, setIntroductionNotice] = useState("");
  const session = useSession();
  const main = useRef<HTMLElement>(null);
  const signedIn = session.status === "signedIn";
  useEffect(() => {
    const change = () => setPage(route());
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.title = page === "privacy" ? "FitRank · Privacy" : page === "terms" ? "FitRank · Terms" : showIntroduction ? "Welcome to FitRank" : !signedIn ? "FitRank · Sign in" : `FitRank · ${page === "log-workout" ? "Log Workout" : page[0].toUpperCase() + page.slice(1)}`;
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [page, showIntroduction, signedIn]);
  return <div className="fitrank-app">
    <a href="#main-content" className="app-skip" onClick={event => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a>
    <header className="app-header"><a className="app-wordmark" href="#/home">FITRANK</a><span>Your work. Your progress.</span></header>
    {!showIntroduction && signedIn && <nav className="app-nav" aria-label="Main navigation">{navigation.map(label => {
      const target = label.toLowerCase(); const active = page === target || (target === "workouts" && page === "log-workout");
      return <a key={label} href={`#/${target}`} aria-current={active ? "page" : undefined}>{label}{target === "food" && <small className="app-nav-soon"> Soon</small>}</a>;
    })}</nav>}
    <main id="main-content" ref={main} tabIndex={-1} className="app-main">
      {page === "privacy" ? <Privacy signedIn={signedIn} /> : page === "terms" ? <Terms signedIn={signedIn} /> : showIntroduction ? <Introduction onComplete={() => {
        if (!completeIntroduction()) setIntroductionNotice("Your introduction preference couldn’t be saved in this browser. You can continue, but the introduction may appear next time.");
        setShowIntroduction(false);
      }} /> : <>
      {introductionNotice && <p role="status" className="app-introduction-notice">{introductionNotice}</p>}
      {session.status === "loading" ? <p role="status">Loading…</p>
        : session.status === "signedIn" ? <AccountProvider key={session.user.id} user={session.user}><SignedInPages page={page} /></AccountProvider>
        : <SignIn unconfigured={session.status === "unconfigured"} error={session.status === "signedOut" ? session.error : undefined} />}
      </>}
    </main>
  </div>;
}
