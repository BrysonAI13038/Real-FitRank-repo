import type { Workout } from "./model";
import { scoreWorkout } from "./scoring";

const V1_KEY = "fitrank.workouts.v1";
const KEY = "fitrank.data.v2";
export type SavedWorkout = { id: string; completedAt: string; exercises: Workout[]; earned: number };
// elo is always derived from workouts. quarantine keeps raw entries that failed
// validation so they are never deleted.
export type SavedData = { version: 2; workouts: SavedWorkout[]; elo: number; quarantine: unknown[] };
export type Reward = { workoutCount: number; before: number; after: number; earned: number; workout: SavedWorkout };

const UNREADABLE = "Saved workout data could not be read. Nothing was overwritten.";
const isRecord = (value: unknown): value is Record<string, any> => typeof value === "object" && value !== null && !Array.isArray(value);
const isSet = (set: unknown) => isRecord(set) && typeof set.weightLbs === "number" && Number.isFinite(set.weightLbs) && set.weightLbs >= 0 && Number.isSafeInteger(set.reps) && set.reps >= 1;
const isExercise = (ex: unknown) => isRecord(ex) && typeof ex.exerciseId === "string" && ex.exerciseId !== "" && Array.isArray(ex.sets) && ex.sets.length > 0 && ex.sets.every(isSet);

// Sanity checks only. Input limits (catalog, max weight/reps/sets) apply to new
// entries in processWorkout, not to history, so tightening them never hides data.
function isWorkout(workout: unknown): workout is SavedWorkout {
  return isRecord(workout) && typeof workout.id === "string" && workout.id !== ""
    && typeof workout.completedAt === "string" && Number.isFinite(Date.parse(workout.completedAt))
    && Number.isSafeInteger(workout.earned) && workout.earned >= 0
    && Array.isArray(workout.exercises) && workout.exercises.length > 0 && workout.exercises.every(isExercise)
    && new Set(workout.exercises.map((ex: Workout) => ex.exerciseId)).size === workout.exercises.length;
}

// Invalid or duplicate-id entries go to quarantine instead of failing the whole load.
function normalize(workouts: unknown[], quarantine: unknown[]): SavedData {
  const valid: SavedWorkout[] = [];
  const ids = new Set<string>();
  for (const workout of workouts) {
    if (isWorkout(workout) && !ids.has(workout.id)) { valid.push(workout); ids.add(workout.id); }
    else quarantine.push(workout);
  }
  const elo = valid.reduce((sum, workout) => sum + workout.earned, 0);
  if (!Number.isSafeInteger(elo)) throw new Error(UNREADABLE);
  return { version: 2, workouts: valid, elo, quarantine };
}
function parse(raw: string, version: number): Record<string, any> {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error(UNREADABLE); }
  if (!isRecord(data) || data.version !== version || !Array.isArray(data.workouts)) throw new Error(UNREADABLE);
  return data;
}

// Reads v2, or converts v1 in memory. Never writes: v2 is first written by
// saveWorkout (under the cross-tab lock), and the v1 key is never modified.
// Only unparseable documents or unknown versions throw.
export function loadData(storage: Pick<Storage, "getItem"> = localStorage): SavedData {
  const raw = storage.getItem(KEY);
  if (raw) {
    const data = parse(raw, 2);
    return normalize(data.workouts, Array.isArray(data.quarantine) ? [...data.quarantine] : data.quarantine === undefined ? [] : [data.quarantine]);
  }
  const v1 = storage.getItem(V1_KEY);
  if (!v1) return { version: 2, workouts: [], elo: 0, quarantine: [] };
  return normalize(parse(v1, 1).workouts, []);
}
export function saveWorkout(exercises: Workout[], id: string, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): Reward {
  const data = loadData(storage);
  const existingIndex = data.workouts.findIndex(workout => workout.id === id);
  if (existingIndex >= 0) {
    const workout = data.workouts[existingIndex];
    const before = data.workouts.slice(0, existingIndex).reduce((sum, item) => sum + item.earned, 0);
    return { workoutCount: existingIndex + 1, workout, before, after: before + workout.earned, earned: workout.earned };
  }
  const earned = scoreWorkout(exercises, data.workouts);
  const after = data.elo + earned;
  if (!Number.isSafeInteger(after)) throw new Error("ELO total is outside the supported range.");
  const workout: SavedWorkout = { id, completedAt: new Date().toISOString(), exercises, earned };
  storage.setItem(KEY, JSON.stringify({ ...data, workouts: [...data.workouts, workout], elo: after } satisfies SavedData));
  return { workoutCount: data.workouts.length + 1, workout, before: data.elo, after, earned };
}
