import { exercises, MUSCLE_GROUPS } from "./exercises";
import { dayKey, weekStart } from "./scoring";
import type { Workout } from "./model";

// Pure, read-only views over saved history (chronological). Nothing here is stored.
type History = { completedAt: string; exercises: Workout[]; earned?: number }[];

export type SessionPoint = { date: string; bestWeight: number; bestReps: number; volume: number };

// One point per session that included the exercise. Bodyweight (0 lb) sets count toward
// reps only, so a bodyweight-only session has bestWeight 0 and volume 0.
export function exerciseSeries(history: History, exerciseId: string): SessionPoint[] {
  const points: SessionPoint[] = [];
  for (const workout of history) {
    const sets = workout.exercises.filter(item => item.exerciseId === exerciseId).flatMap(item => item.sets);
    if (!sets.length) continue;
    points.push({
      date: workout.completedAt,
      bestWeight: Math.max(...sets.map(set => set.weightLbs)),
      bestReps: Math.max(...sets.map(set => set.reps)),
      volume: sets.reduce((sum, set) => sum + set.weightLbs * set.reps, 0),
    });
  }
  return points;
}

export type PersonalRecord = { exerciseId: string; name: string; weightLbs: number; reps: number; date: string };

// Heaviest set per exercise (ties go to more reps, then the earlier date). Bodyweight-only
// exercises report their best reps at 0 lb. Sorted heaviest first.
export function personalRecords(history: History): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  for (const workout of history) {
    for (const item of workout.exercises) {
      for (const set of item.sets) {
        const current = best.get(item.exerciseId);
        if (!current || set.weightLbs > current.weightLbs || (set.weightLbs === current.weightLbs && set.reps > current.reps)) {
          best.set(item.exerciseId, { exerciseId: item.exerciseId, name: exercises.find(e => e.id === item.exerciseId)?.name ?? item.exerciseId, weightLbs: set.weightLbs, reps: set.reps, date: workout.completedAt });
        }
      }
    }
  }
  return [...best.values()].sort((a, b) => b.weightLbs - a.weightLbs || b.reps - a.reps || a.name.localeCompare(b.name));
}

export type WeekCount = { weekStart: Date; days: number };

// Distinct training days in each of the last `weeks` Mon-Sun weeks, oldest first, ending with the current week.
export function weeklyCounts(history: History, weeks: number, now = new Date()): WeekCount[] {
  const perWeek = new Map<string, Set<string>>();
  for (const workout of history) {
    const date = new Date(workout.completedAt);
    const key = dayKey(weekStart(date));
    perWeek.set(key, (perWeek.get(key) ?? new Set()).add(dayKey(date)));
  }
  const result: WeekCount[] = [];
  const cursor = weekStart(now);
  cursor.setDate(cursor.getDate() - 7 * (weeks - 1));
  for (let i = 0; i < weeks; i++) {
    result.push({ weekStart: new Date(cursor), days: perWeek.get(dayKey(cursor))?.size ?? 0 });
    cursor.setDate(cursor.getDate() + 7);
  }
  return result;
}

// Running ELO total after each workout, matching how storage derives elo (sum of earned).
export function eloSeries(history: History): { date: string; elo: number }[] {
  let elo = 0;
  return history.map(workout => ({ date: workout.completedAt, elo: elo += workout.earned ?? 0 }));
}

// Sets per primary muscle group over the last `days` days (every group present, zero if
// untrained). `days: null` means all history. Only workouts between the cutoff and `now` count.
export function recentMuscleSets(history: History, days: number | null, now = new Date()): { muscle: string; sets: number }[] {
  const from = days === null ? -Infinity : now.getTime() - days * 24 * 60 * 60 * 1000;
  return muscleSets(history.filter(workout => {
    const time = Date.parse(workout.completedAt);
    return time >= from && time <= now.getTime();
  }));
}

// Shading step 0 to 4, relative to the most-trained muscle in the same view, so it never
// implies a target. 0 means no sets; 4 means the most.
export const muscleLevel = (sets: number, max: number) => sets <= 0 || max <= 0 ? 0 : Math.min(4, Math.ceil(4 * sets / max));

// Total sets per primary muscle group, every group present (zero if untrained).
export function muscleSets(history: History): { muscle: string; sets: number }[] {
  const totals = new Map<string, number>(MUSCLE_GROUPS.map(muscle => [muscle, 0]));
  for (const workout of history) {
    for (const item of workout.exercises) {
      const primary = exercises.find(e => e.id === item.exerciseId)?.primary;
      if (primary) totals.set(primary, (totals.get(primary) ?? 0) + item.sets.length);
    }
  }
  return [...totals].map(([muscle, sets]) => ({ muscle, sets }));
}
