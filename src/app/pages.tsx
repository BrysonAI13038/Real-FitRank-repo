import { useEffect, useRef, useState } from "react";
import Introduction from "./Introduction";
import type { SavedData } from "../workout/storage";
import { latestComparisons, summarize } from "./data";
import { weekStatus } from "../workout/scoring";
import Goals from "./Goals";
import { exerciseName, PageHeading, RankCard, WorkoutList } from "./components";

const logAction = <a href="#/log-workout" className="app-button">+ Log Workout</a>;
export function Home({ data }: { data: SavedData }) {
  const stats = summarize(data.workouts);
  const week = weekStatus(data.workouts);
  return <>
    <PageHeading title="Your progress" subtitle="Log a workout, earn ELO, and watch your progress grow." action={logAction} />
    <div className="app-dashboard"><RankCard elo={data.elo} /><div className="app-stack">
      <div className="app-stats app-card">{[[stats.workouts,"Workouts"],[stats.thisWeek,"Workouts this week"],[stats.sets,"Sets completed"]].map(([value,label]) => <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
      <section className="app-card"><p className="app-label">This week</p><p><strong>{Math.min(week.days, week.target)} of {week.target}</strong> training days{week.days >= week.target ? " · weekly target reached" : ""}{week.streak > 0 ? ` · ${week.streak}-week streak` : ""}</p></section>
      <section className="app-card"><p className="app-label">Keep building</p><blockquote>“Consistency builds strength.”</blockquote><div className="app-actions">{logAction}<a href="#/food" className="app-button app-secondary">+ Log Food</a></div></section>
      <section><div className="app-section-heading"><h2>Recent workouts</h2><a href="#/workouts">View all →</a></div><WorkoutList workouts={data.workouts.slice(-3)} /></section>
    </div></div>
  </>;
}
export function Workouts({ data }: { data: SavedData }) {
  return <><PageHeading title="Workouts" subtitle="Every session, in one place." action={logAction} /><WorkoutList workouts={data.workouts} details /></>;
}
export function Progress({ data, onChange }: { data: SavedData; onChange?: () => void }) {
  const comparisons = latestComparisons(data.workouts);
  return <><PageHeading title="Progress" subtitle="Built one session at a time." /><div className="app-dashboard"><RankCard elo={data.elo} /><div className="app-stack">
    <section className="app-card"><h2>Latest performance</h2><p>Heaviest set in your latest workout, compared with the previous session for that exercise.</p>
      {!comparisons.length && <p>Log your first workout to establish a starting point.</p>}
      {comparisons.map(item => <div className="app-comparison" key={item.exerciseId}><h3>{exerciseName(item.exerciseId)}</h3><p className="app-current">{item.current.weightLbs} lbs · {item.current.reps} reps</p>
        <p>{item.previous ? `Previous: ${item.previous.weightLbs} lbs · ${item.previous.reps} reps` : "First recorded session. Your starting point is set."}</p>
        {item.previous && <p className={item.current.weightLbs >= item.previous.weightLbs && item.current.reps >= item.previous.reps && (item.current.weightLbs > item.previous.weightLbs || item.current.reps > item.previous.reps) ? "app-accent" : ""}>{item.current.weightLbs >= item.previous.weightLbs && item.current.reps >= item.previous.reps && (item.current.weightLbs > item.previous.weightLbs || item.current.reps > item.previous.reps) ? "More weight or reps than last time." : "Another session recorded. Keep building."}</p>}
      </div>)}
    </section>
    <Goals data={data} onChange={onChange} />
    <section><h2 className="app-section-title">Recent ELO progress</h2><WorkoutList workouts={data.workouts.slice(-3)} /></section>
  </div></div></>;
}
export function Food() {
  return <><PageHeading title="Food" subtitle="Fuel for the work you do." /><section className="app-card app-empty"><p className="app-label">Food tracking</p><h2>A place for your meals.</h2><p>Food logging isn’t available yet. This space will let you record meals alongside your training.</p><p>No food scores. No judgment.</p><a href="#/home" className="app-button app-secondary">Back to Home</a></section></>;
}
export function Settings({ data }: { data: SavedData | null }) {
  const [message, setMessage] = useState("");
  const [reviewingIntroduction, setReviewingIntroduction] = useState(false);
  const reviewContainer = useRef<HTMLDivElement>(null);
  const introductionButton = useRef<HTMLButtonElement>(null);
  const hasReviewed = useRef(false);
  useEffect(() => {
    if (reviewingIntroduction) {
      hasReviewed.current = true;
      reviewContainer.current?.focus();
    } else if (hasReviewed.current) introductionButton.current?.focus();
  }, [reviewingIntroduction]);
  function exportData() {
    if (!data) return;
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = "fitrank-workouts.json"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage("Your data export is ready to download.");
    } catch { setMessage("Couldn’t export your data. Please try again."); }
  }
  if (reviewingIntroduction) return <div ref={reviewContainer} tabIndex={-1} className="app-introduction-review"><Introduction reviewing onComplete={() => setReviewingIntroduction(false)} /></div>;
  return <><PageHeading title="Settings" subtitle="Your app. Your data." /><section className="app-card"><h2>Saved on this browser</h2><p>Workouts and ELO are stored on this device using browser storage. They stay between visits, but won’t sync to other browsers or devices.</p><p>Clearing this site’s browser data also clears your saved workouts and ELO.</p><button className="app-button app-secondary" onClick={exportData} disabled={!data}>Export workout data</button><p role="status">{message}</p></section><section className="app-card app-about"><h2>About FitRank</h2><p>Log workouts, earn ELO, and build your rank over time.</p><p>Weight is recorded in pounds. ELO never decreases.</p><button ref={introductionButton} type="button" className="app-button app-secondary" onClick={() => setReviewingIntroduction(true)}>View FitRank Introduction</button></section></>;
}
