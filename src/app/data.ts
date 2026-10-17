import { useCallback, useEffect, useState } from "react";
import { loadData, type SavedData, type SavedWorkout } from "../workout/storage";
import { weekStart } from "../workout/scoring";

export function useWorkoutData() {
  const [data, setData] = useState<SavedData | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(() => {
    try { setData(loadData()); setError(""); }
    catch { setData(null); setError("Your saved workouts couldn’t be loaded. Nothing has been changed. Check browser storage access, then try again."); }
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => { window.removeEventListener("storage", refresh); window.removeEventListener("focus", refresh); };
  }, [refresh]);
  return { data, error, refresh };
}

export function summarize(workouts: SavedWorkout[], now = new Date()) {
  const start = weekStart(now);
  return {
    workouts: workouts.length,
    thisWeek: workouts.filter(workout => new Date(workout.completedAt) >= start && new Date(workout.completedAt) <= now).length,
    sets: workouts.reduce((sum, workout) => sum + workout.exercises.reduce((count, exercise) => count + exercise.sets.length, 0), 0),
  };
}

// Display only: compare recorded heaviest sets; never recalculate stored ELO.
export function latestComparisons(workouts: SavedWorkout[]) {
  const latest = workouts[workouts.length - 1];
  if (!latest) return [];
  return latest.exercises.map(exercise => {
    const prior = workouts.slice(0, -1).flatMap(workout => workout.exercises).filter(item => item.exerciseId === exercise.exerciseId);
    const previous = prior[prior.length - 1];
    const best = (sets: typeof exercise.sets) => [...sets].sort((a, b) => b.weightLbs - a.weightLbs || b.reps - a.reps)[0];
    return { exerciseId: exercise.exerciseId, current: best(exercise.sets), previous: previous ? best(previous.sets) : null };
  });
}
