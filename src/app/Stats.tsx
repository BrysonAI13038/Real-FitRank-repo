import { useState } from "react";
import type { SavedData } from "../workout/storage";
import { SCORING } from "../workout/scoring";
import { eloSeries, exerciseSeries, personalRecords, weeklyCounts } from "../workout/stats";
import { BarChart, LineChart } from "./charts";
import { exerciseName } from "./components";
import MuscleMap from "./MuscleMap";

const WEEKS = 12;
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

// Progress charts and records, all derived from saved workouts (nothing extra is stored).
export default function Stats({ data }: { data: SavedData }) {
  const [picked, setPicked] = useState("");
  if (!data.workouts.length) return null;
  const records = personalRecords(data.workouts);
  const options = [...records].sort((a, b) => a.name.localeCompare(b.name));
  const exerciseId = options.some(option => option.exerciseId === picked) ? picked : (records[0]?.exerciseId ?? "");
  const series = exerciseSeries(data.workouts, exerciseId).filter(point => point.bestWeight > 0);
  const weeks = weeklyCounts(data.workouts, WEEKS);
  return <>
    <MuscleMap workouts={data.workouts} />
    <section className="app-card"><h2>ELO over time</h2>
      <LineChart label="ELO over time" points={eloSeries(data.workouts).map(point => ({ date: point.date, value: point.elo }))} />
    </section>
    <section className="app-card"><h2>Weekly consistency</h2><p>Training days per week, last {WEEKS} weeks. The dashed line is the {SCORING.weeklyDays}-day target.</p>
      <BarChart label="Training days per week" target={SCORING.weeklyDays} bars={weeks.map(week => ({ label: week.weekStart.toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: week.days }))} />
    </section>
    <section className="app-card"><h2>Exercise progress</h2>
      <label className="app-label" htmlFor="stats-exercise">Exercise</label>
      <select id="stats-exercise" className="app-select" value={exerciseId} onChange={event => setPicked(event.target.value)}>{options.map(option => <option key={option.exerciseId} value={option.exerciseId}>{option.name}</option>)}</select>
      <p>Heaviest set per session, in lbs.</p>
      <LineChart label={`${exerciseName(exerciseId)} heaviest set`} unit=" lbs" points={series.map(point => ({ date: point.date, value: point.bestWeight }))} />
    </section>
    <section className="app-card"><h2>Personal records</h2>
      <ul className="app-records">{records.map(record => <li key={record.exerciseId}><span>{record.name}</span><span><strong>{record.weightLbs > 0 ? `${record.weightLbs} lbs × ${record.reps}` : `${record.reps} reps`}</strong> · {shortDate(record.date)}</span></li>)}</ul>
    </section>
  </>;
}
