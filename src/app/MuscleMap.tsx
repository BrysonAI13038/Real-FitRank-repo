import { useState } from "react";
import type { SavedWorkout } from "../workout/storage";
import type { MuscleGroup } from "../workout/exercises";
import { muscleLevel, recentMuscleSets } from "../workout/stats";

// Hand-drawn figure, right half only. Paired muscles are mirrored across x = 100.
type Shape = { muscle?: MuscleGroup; d: string; pair?: boolean };
const MIRROR = "translate(200 0) scale(-1 1)";

const shoulder = "M126 64 C140 61 154 68 157 83 C158 93 154 101 148 105 L136 93 C130 84 126 74 126 64 Z";
const upperArm = "M149 107 C155 104 162 111 163 126 C164 139 161 150 155 156 L145 152 C146 138 146 122 149 107 Z";
const forearm = "M146 159 L158 161 C163 179 166 197 168 213 L158 217 C152 203 148 181 146 159 Z";
const calf = "M108 292 L130 292 C134 318 132 346 127 368 L113 368 C108 346 106 318 108 292 Z";
const BASE: Shape[] = [
  { d: "M72 64 L128 64 L127 112 L122 178 L78 178 L73 112 Z" },
  { d: "M84 30 a16 19 0 1 0 32 0 a16 19 0 1 0 -32 0 Z" },
  { d: "M92 46 L108 46 L110 62 L90 62 Z" },
  { d: "M82 176 L118 176 L128 198 L72 198 Z" },
  { d: "M164 216 L176 220 L174 240 C170 246 162 244 160 234 Z", pair: true },
  { d: "M106 282 L132 282 L130 292 L108 292 Z", pair: true },
  { d: "M108 370 L132 370 L134 384 C124 390 110 390 106 384 Z", pair: true },
];
const FRONT: Shape[] = [
  { muscle: "Shoulders", d: shoulder, pair: true },
  { muscle: "Chest", d: "M101 68 L124 66 C130 80 132 94 128 106 C118 111 107 109 101 103 Z", pair: true },
  { muscle: "Biceps", d: upperArm, pair: true },
  { muscle: "Forearms", d: forearm, pair: true },
  { muscle: "Core", d: "M86 112 L114 112 L112 150 L111 176 C106 181 94 181 89 176 L88 150 Z" },
  { muscle: "Quads", d: "M102 200 L132 196 C139 224 138 254 132 282 L106 282 C101 258 99 228 102 200 Z", pair: true },
  { muscle: "Calves", d: calf, pair: true },
];
const BACK: Shape[] = [
  { muscle: "Back", d: "M100 60 L124 66 C132 86 130 110 122 132 L110 156 L100 160 L90 156 L78 132 C70 110 68 86 76 66 Z" },
  { muscle: "Back", d: "M90 160 L110 160 L116 178 L84 178 Z" },
  { muscle: "Shoulders", d: shoulder, pair: true },
  { muscle: "Triceps", d: upperArm, pair: true },
  { muscle: "Forearms", d: forearm, pair: true },
  { muscle: "Glutes", d: "M101 180 C116 176 134 182 136 200 C136 214 121 222 101 220 Z", pair: true },
  { muscle: "Hamstrings", d: "M101 224 L133 224 C138 248 136 270 131 284 L106 284 C101 266 99 244 101 224 Z", pair: true },
  { muscle: "Calves", d: calf, pair: true },
];

const WINDOWS = [{ id: "7", label: "7 days", days: 7 as number | null }, { id: "30", label: "30 days", days: 30 as number | null }, { id: "all", label: "All time", days: null as number | null }];
const plural = (n: number) => `${n} ${n === 1 ? "set" : "sets"}`;

function Figure({ shapes, sets, max, name }: { shapes: Shape[]; sets: Map<string, number>; max: number; name: string }) {
  return <figure className="app-body-figure">
    <svg viewBox="0 0 200 400" aria-hidden="true" focusable="false" className="app-body">
      {BASE.map((shape, i) => <g key={i} className="mm-base"><path d={shape.d} />{shape.pair && <path d={shape.d} transform={MIRROR} />}</g>)}
      {shapes.map((shape, i) => {
        const count = sets.get(shape.muscle!) ?? 0;
        return <g key={i} className={`mm-shape mm-l${muscleLevel(count, max)}`} data-muscle={shape.muscle}>
          <title>{`${shape.muscle}: ${plural(count)}`}</title>
          <path d={shape.d} />{shape.pair && <path d={shape.d} transform={MIRROR} />}
        </g>;
      })}
    </svg>
    <figcaption>{name}</figcaption>
  </figure>;
}

// Which muscle groups you have trained, from saved workouts (each exercise counts for its
// main muscle). Shading is relative to your own most-trained muscle, so it sets no target.
export default function MuscleMap({ workouts, now }: { workouts: SavedWorkout[]; now?: Date }) {
  const [windowId, setWindowId] = useState("7");
  const chosen = WINDOWS.find(item => item.id === windowId) ?? WINDOWS[0];
  const counts = recentMuscleSets(workouts, chosen.days, now ?? new Date());
  const sets = new Map(counts.map(item => [item.muscle, item.sets]));
  const max = Math.max(0, ...counts.map(item => item.sets));
  const ranked = [...counts].sort((a, b) => b.sets - a.sets || a.muscle.localeCompare(b.muscle));
  return <section className="app-card app-muscle" aria-labelledby="muscle-title">
    <h2 id="muscle-title">Muscle map</h2>
    <p>Sets by main muscle. Brighter means more sets than your other muscles in this period.</p>
    <div className="app-segmented" role="group" aria-label="Time period">
      {WINDOWS.map(item => <button key={item.id} type="button" aria-pressed={item.id === windowId} onClick={() => setWindowId(item.id)}>{item.label}</button>)}
    </div>
    <div className="app-body-figures">
      <Figure shapes={FRONT} sets={sets} max={max} name="Front" />
      <Figure shapes={BACK} sets={sets} max={max} name="Back" />
    </div>
    <div className="app-muscle-legend" aria-hidden="true"><span>Fewer</span>{[0, 1, 2, 3, 4].map(level => <i key={level} className={`mm-l${level}`} />)}<span>More</span></div>
    {max === 0 && <p role="status">No sets logged {chosen.days === null ? "yet" : `in the last ${chosen.days} days`}. Log a workout and the map lights up.</p>}
    <ul className="app-muscle-list" aria-label={`Sets per muscle, ${chosen.label.toLowerCase()}`}>
      {ranked.map(item => <li key={item.muscle}><i aria-hidden="true" className={`mm-l${muscleLevel(item.sets, max)}`} /><span>{item.muscle}</span><strong>{plural(item.sets)}</strong></li>)}
    </ul>
  </section>;
}
