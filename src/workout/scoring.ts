import { MAX_EXERCISES, processWorkout, type Workout } from "./model";

export const RANKS = [
  { name: "Bronze", min: 0 }, { name: "Silver", min: 300 },
  { name: "Gold", min: 1000 }, { name: "Platinum", min: 2500 },
  { name: "Diamond", min: 5500 }, { name: "Elite", min: 11000 },
];
export function rankProgress(elo: number) {
  const index = RANKS.reduce((found, rank, i) => elo >= rank.min ? i : found, 0);
  const rank = RANKS[Math.max(0, index)];
  const next = RANKS[index + 1];
  return { rank: rank.name, next: next?.name, remaining: next ? next.min - elo : 0,
    percent: next ? Math.max(0, Math.min(100, (elo - rank.min) / (next.min - rank.min) * 100)) : 100 };
}
export type ScoredWorkout = { exercises: Workout[]; earned: number };

// PROTOTYPE SCORING SYSTEM: tunable, fixed bonuses (never proportional to load).
// +10 completion; +2 per distinct exercise; +2 for an improved best-set score
// vs. the latest session; +10 per exercise exceeding its all-time best.
// First sessions establish a baseline, not a personal-best bonus.
// Best-set score uses weight * (1 + reps/30); for zero-load sets it uses reps.
// Loaded and zero-load performances are compared separately; changing modes
// establishes a new baseline. Extra sets alone never generate a bonus.
export const PROTOTYPE_SCORING = { completion: 10, exercise: 2, improvement: 2, personalBest: 10 };
const performance = (exercise: Workout, loaded: boolean) => Math.max(0, ...exercise.sets
  .filter(set => (set.weightLbs > 0) === loaded)
  .map(set => loaded ? set.weightLbs * (1 + set.reps / 30) : set.reps));

export function scoreWorkout(current: Workout[], history: ScoredWorkout[]): number {
  if (!current.length || current.length > MAX_EXERCISES || new Set(current.map(ex => ex.exerciseId)).size !== current.length) throw new Error("Choose distinct exercises with at least one set.");
  let earned = PROTOTYPE_SCORING.completion;
  for (const exercise of current) {
    const checked = processWorkout(exercise.exerciseId, exercise.sets.map(set => ({ weight: String(set.weightLbs), reps: String(set.reps) })));
    if (!checked.ok) throw new Error("Check your workout values before submitting.");
    earned += PROTOTYPE_SCORING.exercise;
    const past = history.flatMap(workout => workout.exercises).filter(ex => ex.exerciseId === exercise.exerciseId);
    const last = past[past.length - 1];
    if (!last) continue;
    // Large jumps are saved but earn no performance bonuses. This bounds rewards
    // for outliers without penalizing ordinary flat/down sessions or deleting data.
    let improvement = false;
    let personalBest = false;
    for (const loaded of [false, true]) {
      const now = performance(exercise, loaded);
      const before = performance(last, loaded);
      const best = Math.max(0, ...past.map(ex => performance(ex, loaded)));
      if (!before || now > before * 1.5) continue;
      if (now > before + 0.001) improvement = true;
      if (now > best + 0.001) personalBest = true;
    }
    if (improvement) earned += PROTOTYPE_SCORING.improvement;
    if (personalBest) earned += PROTOTYPE_SCORING.personalBest;
  }
  return earned;
}
