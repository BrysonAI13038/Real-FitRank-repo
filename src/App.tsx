import { useEffect, useRef, useState } from "react";
import WorkoutLogger from "./workout/WorkoutLogger";
import { useWorkoutData } from "./app/data";
import { Home, Workouts, Progress, Food, Settings } from "./app/pages";
import "./app/app.css";
import Introduction from "./app/Introduction";
import { hasSeenIntroduction, completeIntroduction } from "./app/introductionPreference";

const navigation = ["Home", "Workouts", "Progress", "Food", "Settings"] as const;
function route() {
  const value = window.location.hash.replace(/^#\//, "");
  return [...navigation.map(item => item.toLowerCase()), "log-workout"].includes(value) ? value : "home";
}
export default function App() {
  const [page, setPage] = useState(route);
  const [showIntroduction, setShowIntroduction] = useState(() => !hasSeenIntroduction());
  const [introductionNotice, setIntroductionNotice] = useState("");
  const { data, error, refresh } = useWorkoutData();
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    const change = () => { setPage(route()); refresh(); };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, [refresh]);
  useEffect(() => {
    document.title = showIntroduction ? "Welcome to FitRank" : `FitRank · ${page === "log-workout" ? "Log Workout" : page[0].toUpperCase() + page.slice(1)}`;
    main.current?.focus();
    window.scrollTo(0, 0);
  }, [page, showIntroduction]);
  return <div className="fitrank-app">
    <a href="#main-content" className="app-skip" onClick={event => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a>
    <header className="app-header"><a className="app-wordmark" href="#/home">FITRANK</a><span>Your work. Your progress.</span></header>
    {!showIntroduction && <nav className="app-nav" aria-label="Main navigation">{navigation.map(label => {
      const target = label.toLowerCase(); const active = page === target || (target === "workouts" && page === "log-workout");
      return <a key={label} href={`#/${target}`} aria-current={active ? "page" : undefined}>{label}{target === "food" && <small className="app-nav-soon"> Soon</small>}</a>;
    })}</nav>}
    <main id="main-content" ref={main} tabIndex={-1} className="app-main">
      {showIntroduction ? <Introduction onComplete={() => {
        if (!completeIntroduction()) setIntroductionNotice("Your introduction preference couldn’t be saved in this browser. You can continue, but the introduction may appear next time.");
        setShowIntroduction(false);
      }} /> : <>
      {introductionNotice && <p role="status" className="app-introduction-notice">{introductionNotice}</p>}
      {error && <div className="app-card app-error" role="alert"><p>{error}</p><button className="app-button app-secondary" onClick={refresh}>Try again</button></div>}
      {page === "food" ? <Food /> : page === "settings" ? <Settings data={data} /> : page === "log-workout" ? <div className="app-logger"><WorkoutLogger onSaved={refresh} onBack={() => { refresh(); window.location.hash = "/home"; }} /></div> : data ? <>
        {page === "home" && <Home data={data} />}
        {page === "workouts" && <Workouts data={data} />}
        {page === "progress" && <Progress data={data} onChange={refresh} />}
      </> : !error && <p role="status">Loading your workouts…</p>}
      </>}
    </main>
  </div>;
}
