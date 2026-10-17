import type { ReactNode } from "react";
import { rankProgress } from "../workout/scoring";
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
    <div className="app-emblem" aria-hidden="true"><span>{progress.rank[0]}</span></div>
    <p className="app-label">Current rank</p><h2>{progress.rank}</h2>
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
    {workout.exercises.map(exercise => <div className="app-exercise" key={exercise.exerciseId}>
      <h3>{exerciseName(exercise.exerciseId)}</h3>
      <p>{exercise.sets.length} {exercise.sets.length === 1 ? "set" : "sets"}</p>
      {details && <ol className="app-sets">{exercise.sets.map((set, i) => <li key={i}><span>Set {i + 1}</span><span>{set.weightLbs} lbs · {set.reps} reps</span></li>)}</ol>}
    </div>)}
  </article>)}</div>;
}
