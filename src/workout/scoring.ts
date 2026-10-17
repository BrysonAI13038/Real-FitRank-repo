import { exercises, MAX_EXERCISES, processWorkout, type Workout } from "./model";

// Higher ranks earn ELO more slowly: session, weekly, streak and milestone ELO are
// scaled by the multiplier of the rank held before the session.
export const RANKS = [
  { name: "Bronze", min: 0, multiplier: 1 }, { name: "Silver", min: 300, multiplier: 0.9 },
  { name: "Gold", min: 900, multiplier: 0.8 }, { name: "Platinum", min: 2000, multiplier: 0.7 },
  { name: "Diamond", min: 4000, multiplier: 0.6 }, { name: "Elite", min: 7500, multiplier: 0.5 },
];
const rankIndex = (elo: number) => Math.max(0, RANKS.reduce((found, rank, i) => elo >= rank.min ? i : found, 0));
export const rankMultiplier = (elo: number) => RANKS[rankIndex(elo)].multiplier;
export function rankProgress(elo: number) {
  const index = rankIndex(elo);
  const rank = RANKS[index];
  const next = RANKS[index + 1];
  return { rank: rank.name, next: next?.name, remaining: next ? next.min - elo : 0,
    percent: next ? Math.max(0, Math.min(100, (elo - rank.min) / (next.min - rank.min) * 100)) : 100 };
}
export type Breakdown = { label: string; amount: number }[];
export type ScoredWorkout = { exercises: Workout[]; completedAt: string };
export type ScoreResult = { earned: number; breakdown: Breakdown };

// PROTOTYPE SCORING SYSTEM: tunable, fixed amounts (never proportional to load).
// session: first session of a calendar day only (extra sessions that day earn no session ELO).
// weekly: on the session that reaches weeklyDays distinct training days in a Mon-Sun week,
//   plus streakPerWeek for each consecutive earlier week that hit the target (max streakMaxWeeks).
// milestone: per exercise, for each milestoneLbs boundary the heaviest set crosses above its
//   all-time best (max milestoneCap per exercise per session). First sessions and
//   bodyweight-only history set a baseline, not a milestone.
// Goal rewards are added separately and are not rank-scaled.
export const SCORING = { session: 10, weekly: 15, weeklyDays: 3, streakPerWeek: 5, streakMaxWeeks: 5, milestoneLbs: 20, milestone: 5, milestoneCap: 3 };

const dayKey = (date: Date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
// Local-time Monday 00:00 of the week containing `date`.
export function weekStart(date: Date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (start.getDay() + 6) % 7);
  return start;
}
function trainingDays(history: { completedAt: string }[]) {
  const weeks = new Map<string, Set<string>>();
  for (const workout of history) {
    const date = new Date(workout.completedAt);
    const week = dayKey(weekStart(date));
    weeks.set(week, (weeks.get(week) ?? new Set()).add(dayKey(date)));
  }
  return weeks;
}
// Consistency snapshot for a given moment: distinct training days so far this week,
// and the run of consecutive earlier weeks that each reached the weekly target.
export function weekStatus(history: { completedAt: string }[], now = new Date()) {
  const weeks = trainingDays(history);
  const days = weeks.get(dayKey(weekStart(now)))?.size ?? 0;
  let streak = 0;
  const cursor = weekStart(now);
  while (streak < SCORING.streakMaxWeeks) {
    cursor.setDate(cursor.getDate() - 7);
    if ((weeks.get(dayKey(cursor))?.size ?? 0) < SCORING.weeklyDays) break;
    streak++;
  }
  return { days, target: SCORING.weeklyDays, streak, trainedToday: weeks.get(dayKey(weekStart(now)))?.has(dayKey(now)) ?? false };
}

const heaviest = (sets: Workout["sets"]) => sets.reduce((best, set) => Math.max(best, set.weightLbs), 0);

export function scoreWorkout(current: Workout[], history: ScoredWorkout[], elo: number, now = new Date()): ScoreResult {
  if (!current.length || current.length > MAX_EXERCISES || new Set(current.map(ex => ex.exerciseId)).size !== current.length) throw new Error("Choose distinct exercises with at least one set.");
  for (const exercise of current) {
    if (!processWorkout(exercise.exerciseId, exercise.sets.map(set => ({ weight: String(set.weightLbs), reps: String(set.reps) }))).ok) throw new Error("Check your workout values before submitting.");
  }
  const multiplier = rankMultiplier(elo);
  const breakdown: Breakdown = [];
  const add = (label: string, base: number) => {
    const amount = Math.round(base * multiplier);
    if (amount > 0) breakdown.push({ label, amount });
  };
  const status = weekStatus(history, now);
  if (!status.trainedToday) {
    add("Session", SCORING.session);
    if (status.days + 1 === SCORING.weeklyDays) {
      add(`Weekly target: ${SCORING.weeklyDays} training days`, SCORING.weekly);
      if (status.streak > 0) add(`Streak: ${status.streak} ${status.streak === 1 ? "week" : "weeks"} in a row`, SCORING.streakPerWeek * status.streak);
    }
  }
  for (const exercise of current) {
    const past = history.flatMap(workout => workout.exercises).filter(ex => ex.exerciseId === exercise.exerciseId);
    const before = past.reduce((best, ex) => Math.max(best, heaviest(ex.sets)), 0);
    if (before <= 0) continue;
    const crossed = Math.min(SCORING.milestoneCap, Math.floor(heaviest(exercise.sets) / SCORING.milestoneLbs) - Math.floor(before / SCORING.milestoneLbs));
    if (crossed > 0) add(`${exercises.find(item => item.id === exercise.exerciseId)?.name ?? exercise.exerciseId}: ${crossed} × ${SCORING.milestoneLbs} lb ${crossed === 1 ? "milestone" : "milestones"}`, SCORING.milestone * crossed);
  }
  return { earned: breakdown.reduce((sum, line) => sum + line.amount, 0), breakdown };
}
