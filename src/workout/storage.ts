import type { Workout } from "./model";
import { scoreWorkout, type Breakdown } from "./scoring";
import { isGoal, validateGoal, type Goal, type GoalInput } from "./goals";

const V1_KEY = "fitrank.workouts.v1";
const V2_KEY = "fitrank.data.v2";
const KEY = "fitrank.data.v3";
// breakdown: why a workout earned what it did, one line per source. Absent on workouts saved before v3.
export type SavedWorkout = { id: string; completedAt: string; exercises: Workout[]; earned: number; breakdown?: Breakdown };
// elo is always derived from workouts. quarantine keeps raw entries (workouts or
// goals) that failed validation so they are never deleted.
export type SavedData = { version: 3; workouts: SavedWorkout[]; goals: Goal[]; elo: number; quarantine: unknown[] };
export type Reward = { workoutCount: number; before: number; after: number; earned: number; workout: SavedWorkout };

const UNREADABLE = "Saved workout data could not be read. Nothing was overwritten.";
const isRecord = (value: unknown): value is Record<string, any> => typeof value === "object" && value !== null && !Array.isArray(value);
const isSet = (set: unknown) => isRecord(set) && typeof set.weightLbs === "number" && Number.isFinite(set.weightLbs) && set.weightLbs >= 0 && Number.isSafeInteger(set.reps) && set.reps >= 1;
const isBreakdown = (value: unknown) => Array.isArray(value) && value.every(line => isRecord(line) && typeof line.label === "string" && Number.isSafeInteger(line.amount));
const toList = (value: unknown): unknown[] => Array.isArray(value) ? [...value] : value === undefined ? [] : [value];
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

// A malformed breakdown is only display data, so drop it instead of quarantining the workout.
function withValidBreakdown(workout: SavedWorkout): SavedWorkout {
  if (workout.breakdown === undefined || isBreakdown(workout.breakdown)) return workout;
  const { breakdown, ...rest } = workout;
  return rest;
}

// Invalid or duplicate-id entries go to quarantine instead of failing the whole load.
function normalize(workouts: unknown[], goals: unknown[], quarantine: unknown[]): SavedData {
  const valid: SavedWorkout[] = [];
  const ids = new Set<string>();
  for (const workout of workouts) {
    if (isWorkout(workout) && !ids.has(workout.id)) { valid.push(withValidBreakdown(workout)); ids.add(workout.id); }
    else quarantine.push(workout);
  }
  const validGoals: Goal[] = [];
  const goalIds = new Set<string>();
  for (const goal of goals) {
    if (isGoal(goal) && !goalIds.has(goal.id)) { validGoals.push(goal); goalIds.add(goal.id); }
    else quarantine.push(goal);
  }
  const elo = valid.reduce((sum, workout) => sum + workout.earned, 0);
  if (!Number.isSafeInteger(elo)) throw new Error(UNREADABLE);
  return { version: 3, workouts: valid, goals: validGoals, elo, quarantine };
}
function parse(raw: string, version: number): Record<string, any> {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new Error(UNREADABLE); }
  if (!isRecord(data) || data.version !== version || !Array.isArray(data.workouts)) throw new Error(UNREADABLE);
  return data;
}

// Reads v3, else converts v2, else v1, in memory. Never writes: v3 is first written
// by saveWorkout / addGoal (under the cross-tab lock), and the v1 and v2 keys are
// never modified. Only unparseable documents or unknown versions throw.
export function loadData(storage: Pick<Storage, "getItem"> = localStorage): SavedData {
  const raw = storage.getItem(KEY);
  if (raw) {
    const data = parse(raw, 3);
    return normalize(data.workouts, toList(data.goals), toList(data.quarantine));
  }
  const v2 = storage.getItem(V2_KEY);
  if (v2) {
    const data = parse(v2, 2);
    return normalize(data.workouts, [], toList(data.quarantine));
  }
  const v1 = storage.getItem(V1_KEY);
  if (!v1) return { version: 3, workouts: [], goals: [], elo: 0, quarantine: [] };
  return normalize(parse(v1, 1).workouts, [], []);
}
export function saveWorkout(exercises: Workout[], id: string, storage: Pick<Storage, "getItem" | "setItem"> = localStorage, now = new Date()): Reward {
  const data = loadData(storage);
  const existingIndex = data.workouts.findIndex(workout => workout.id === id);
  if (existingIndex >= 0) {
    const workout = data.workouts[existingIndex];
    const before = data.workouts.slice(0, existingIndex).reduce((sum, item) => sum + item.earned, 0);
    return { workoutCount: existingIndex + 1, workout, before, after: before + workout.earned, earned: workout.earned };
  }
  const { earned, breakdown } = scoreWorkout(exercises, data.workouts, data.elo, now);
  const after = data.elo + earned;
  if (!Number.isSafeInteger(after)) throw new Error("ELO total is outside the supported range.");
  const workout: SavedWorkout = { id, completedAt: now.toISOString(), exercises, earned, breakdown };
  storage.setItem(KEY, JSON.stringify({ ...data, workouts: [...data.workouts, workout], elo: after } satisfies SavedData));
  return { workoutCount: data.workouts.length + 1, workout, before: data.elo, after, earned };
}

// Throws the validation message (see validateGoal) when the goal is not allowed.
export function addGoal(input: GoalInput, id: string, storage: Pick<Storage, "getItem" | "setItem"> = localStorage, now = new Date()): Goal {
  const data = loadData(storage);
  const existing = data.goals.find(goal => goal.id === id);
  if (existing) return existing;
  const checked = validateGoal(input, data.workouts, data.goals);
  if (!checked.ok) throw new Error(checked.error);
  const goal: Goal = { id, exerciseId: input.exerciseId, kind: input.kind, target: input.target,
    ...(input.kind === "reps" ? { atWeightLbs: input.atWeightLbs } : {}), baseline: checked.baseline, reward: checked.reward, createdAt: now.toISOString() };
  storage.setItem(KEY, JSON.stringify({ ...data, goals: [...data.goals, goal] } satisfies SavedData));
  return goal;
}
// Only active goals can be removed; achieved goals stay as history of an ELO reward already earned.
export function deleteGoal(id: string, storage: Pick<Storage, "getItem" | "setItem"> = localStorage): void {
  const data = loadData(storage);
  if (!data.goals.some(goal => goal.id === id && !goal.achievedAt)) return;
  storage.setItem(KEY, JSON.stringify({ ...data, goals: data.goals.filter(goal => goal.id !== id) } satisfies SavedData));
}
