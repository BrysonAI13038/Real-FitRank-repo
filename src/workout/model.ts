import { exercises } from "./exercises";

export { exercises };
export type SetInput = { weight: string; reps: string };
export type Workout = { exerciseId: string; sets: { weightLbs: number; reps: number }[] };
export type WorkoutErrors = { exercise?: string; sets?: string; rows: { weight?: string; reps?: string }[] };
export type ProcessResult = { ok: true; workout: Workout } | { ok: false; errors: WorkoutErrors };

// Prototype input bounds, not training recommendations. Weight limits live in the exercise catalog.
export const MAX_SETS = 20;
export const MAX_EXERCISES = 7;
export const MAX_REPS = 100;

// Pure input processing; deliberately independent of UI, storage, and scoring.
export function processWorkout(exerciseId: string, sets: SetInput[]): ProcessResult {
  const errors: WorkoutErrors = { rows: [] };
  const maxWeight = exercises.find(exercise => exercise.id === exerciseId)?.maxWeightLbs ?? 0;
  if (!exercises.some(exercise => exercise.id === exerciseId)) errors.exercise = "Select an exercise from the list.";
  if (sets.length > MAX_SETS) errors.sets = `Use at most ${MAX_SETS} sets per exercise.`;
  if (!sets.length) errors.sets = "Add at least one set.";
  errors.rows = sets.map(set => {
    const row: WorkoutErrors["rows"][number] = {};
    if (!/^\d+(\.\d+)?$/.test(set.weight.trim()) || !Number.isFinite(Number(set.weight)) || Number(set.weight) < 0 || Number(set.weight) > maxWeight) row.weight = `Enter a weight from 0 to ${maxWeight} lbs.`;
    if (!/^\d+$/.test(set.reps.trim()) || !Number.isSafeInteger(Number(set.reps)) || Number(set.reps) < 1 || Number(set.reps) > MAX_REPS) row.reps = `Enter a whole number from 1 to ${MAX_REPS} reps.`;
    return row;
  });
  if (errors.exercise || errors.sets || errors.rows.some(row => row.weight || row.reps)) return { ok: false, errors };
  return { ok: true, workout: { exerciseId, sets: sets.map(set => ({ weightLbs: Number(set.weight), reps: Number(set.reps) })) } };
}

export type SessionEntry = { exerciseId: string; sets: SetInput[] };
export type SessionErrors = { session?: string; entries: WorkoutErrors[] };
export type SessionResult = { ok: true; exercises: Workout[] } | { ok: false; errors: SessionErrors };

// Validates a whole session: 1 to MAX_EXERCISES distinct exercises, each through processWorkout.
export function processSession(entries: SessionEntry[]): SessionResult {
  const errors: SessionErrors = { entries: [] };
  if (!entries.length) errors.session = "Add at least one exercise.";
  else if (entries.length > MAX_EXERCISES) errors.session = `Use at most ${MAX_EXERCISES} exercises per session.`;
  else if (new Set(entries.map(entry => entry.exerciseId)).size !== entries.length) errors.session = "Each exercise can only be added once.";
  const results = entries.map(entry => processWorkout(entry.exerciseId, entry.sets));
  errors.entries = results.map(result => result.ok ? { rows: [] } : result.errors);
  if (errors.session || results.some(result => !result.ok)) return { ok: false, errors };
  return { ok: true, exercises: results.map(result => (result as { ok: true; workout: Workout }).workout) };
}
