import { useState, type ReactNode } from "react";
import { missedSessionBonus, rankProgress, SESSION_ONCE_A_DAY } from "../workout/scoring";
import RankBadge from "./RankBadge";
import { rankStyle } from "./rankStyle";
import { exercises } from "../workout/model";
import type { SavedWorkout } from "../workout/storage";

export const exerciseName = (id: string) => exercises.find(exercise => exercise.id === id)?.name ?? id;
export function PageHeading({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <header className="app-page-heading"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>;
}
export function EloExplanation() {
  return <details className="app-elo-help">
    <summary>What is ELO?</summary>
    <p>ELO is FitRank's progress score. You earn it by training consistently, putting in solid sets, reaching new weight milestones and hitting your goals. Higher ranks earn ELO more slowly. Your ELO never decreases.</p>
  </details>;
}
export function RankCard({ elo }: { elo: number }) {
  const progress = rankProgress(elo);
  return <section className="app-card app-rank" aria-label="Your rank and ELO">
    <RankBadge rank={progress.rank} />
    <p className="app-label">Current rank</p><h2 style={{ color: rankStyle(progress.rank).light }}>{progress.rank}</h2>
    <p className="app-elo">{elo.toLocaleString()}</p><p className="app-label">ELO</p>
    <EloExplanation />
    <div className="app-rank-track" role="progressbar" aria-label={progress.next ? `Progress to ${progress.next}` : "Elite rank achieved"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress.percent)}><div style={{ width: `${progress.percent}%` }} /></div>
    <div className="app-rank-labels"><span>{progress.rank}</span><span>{progress.next ?? "Highest rank"}</span></div>
    <p className="app-accent">{progress.next ? `${progress.remaining.toLocaleString()} ELO to ${progress.next}` : "Elite achieved. Keep building."}</p>
  </section>;
}
export function WorkoutList({ workouts, details = false }: { workouts: SavedWorkout[]; details?: boolean }) {
  if (!workouts.length) return <div className="app-card"><h3>Your first session starts here.</h3><p>Log a workout to start building your history and rank progress.</p></div>;
  return <div className="app-workouts">{[...workouts].reverse().map(workout => <article className="app-card" key={workout.id}>
    <div className="app-row"><time dateTime={workout.completedAt}>{new Date(workout.completedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</time><span className="app-accent">+{workout.earned} ELO</span></div>
    {details && workout.breakdown && workout.breakdown.length > 0 && <ul className="app-breakdown" aria-label="How this session earned ELO">{workout.breakdown.map((line, i) => <li key={i}><span>{line.label}</span><span className="app-accent">+{line.amount}</span></li>)}{missedSessionBonus(workout.breakdown) && <li className="app-breakdown-note">{SESSION_ONCE_A_DAY}</li>}</ul>}
    {workout.exercises.map(exercise => <div className="app-exercise" key={exercise.exerciseId}>
      <h3>{exerciseName(exercise.exerciseId)}</h3>
      <p>{exercise.sets.length} {exercise.sets.length === 1 ? "set" : "sets"}</p>
      {details && <ol className="app-sets">{exercise.sets.map((set, i) => <li key={i}><span>Set {i + 1}</span><span>{set.weightLbs} lbs · {set.reps} reps</span></li>)}</ol>}
    </div>)}
  </article>)}</div>;
}

const PAGE_SIZE = 20;
const monthKey = (iso: string) => { const date = new Date(iso); return `${date.getFullYear()}-${date.getMonth()}`; };
// Full history: newest first, grouped by month, filterable by exercise, shown 20 sessions at a time.
export function History({ workouts }: { workouts: SavedWorkout[] }) {
  const [filter, setFilter] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);
  if (!workouts.length) return <WorkoutList workouts={workouts} />;
  const ids = [...new Set(workouts.flatMap(workout => workout.exercises.map(exercise => exercise.exerciseId)))];
  const options = ids.map(id => ({ id, name: exerciseName(id) })).sort((a, b) => a.name.localeCompare(b.name));
  const active = options.some(option => option.id === filter) ? filter : "";
  const matching = [...workouts].reverse().filter(workout => !active || workout.exercises.some(exercise => exercise.exerciseId === active));
  const groups: SavedWorkout[][] = [];
  for (const workout of matching.slice(0, shown)) {
    const last = groups[groups.length - 1];
    if (last && monthKey(last[0].completedAt) === monthKey(workout.completedAt)) last.push(workout); else groups.push([workout]);
  }
  const monthTotal = (workout: SavedWorkout) => matching.filter(item => monthKey(item.completedAt) === monthKey(workout.completedAt)).length;
  return <>
    <div className="app-filter"><label className="app-label" htmlFor="history-filter">Filter by exercise</label>
      <select id="history-filter" value={active} onChange={event => { setFilter(event.target.value); setShown(PAGE_SIZE); }}>
        <option value="">All exercises</option>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
      </select></div>
    {groups.map(group => <section key={monthKey(group[0].completedAt)} aria-label={new Date(group[0].completedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}>
      <div className="app-section-heading"><h2>{new Date(group[0].completedAt).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2><span className="app-label">{monthTotal(group[0])} {monthTotal(group[0]) === 1 ? "session" : "sessions"}</span></div>
      <WorkoutList workouts={[...group].reverse()} details />
    </section>)}
    {matching.length > shown && <button type="button" className="app-button app-secondary" onClick={() => setShown(shown + PAGE_SIZE)}>Show more ({matching.length - shown} older)</button>}
  </>;
}
