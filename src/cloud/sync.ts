import { loadData, writeData, withSaveLock, type SavedData, type SavedWorkout } from "../workout/storage";
import { isGoal, type Goal } from "../workout/goals";

// Rows as stored on the server (see supabase/schema.sql). `data` holds the whole
// SavedWorkout / Goal. user_id is filled in by the server from the signed-in user.
export type WorkoutRow = { id: string; completed_at: string; earned: number; data: unknown };
export type GoalRow = { id: string; data: unknown; deleted_at: string | null; updated_at: string };
export type Remote = {
  pullWorkouts(): Promise<WorkoutRow[]>;
  pullGoals(): Promise<GoalRow[]>;
  // Resolves to the ids of workouts the server refused (for example, over a size or ELO limit).
  pushWorkouts(rows: WorkoutRow[]): Promise<string[]>;
  pushGoals(rows: GoalRow[]): Promise<void>;
};
export type SyncStorage = Pick<Storage, "getItem" | "setItem">;
export type Merged = { data: SavedData; workoutsToPush: SavedWorkout[]; goalRowsToPush: GoalRow[]; knownGoalIds: string[]; pulledWorkouts: number };
export type SyncResult = { pulled: number; pushed: number; rejected: string[] };

export const toWorkoutRow = (workout: SavedWorkout): WorkoutRow => ({ id: workout.id, completed_at: workout.completedAt, earned: workout.earned, data: workout });
const toGoalRow = (goal: Goal, deletedAt: string | null, now: string): GoalRow => ({ id: goal.id, data: goal, deleted_at: deletedAt, updated_at: now });

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const dedupe = (items: unknown[]) => {
  const seen = new Set<string>();
  return items.filter(item => { const key = JSON.stringify(item); return seen.has(key) ? false : (seen.add(key), true); });
};

// Goal rules. Goals are soft-deleted on the server (deleted_at) so a delete reaches other devices.
// - An achieved goal always survives: its reward is already inside a saved workout's ELO.
// - Otherwise a deletion wins. Goal ids are random UUIDs, so a deleted goal never comes back.
// - A goal missing here but active on the server was either deleted on this device (its id
//   is in knownGoalIds, meaning we saw it on the server before) or created elsewhere.
function mergeGoals(local: Goal[], remote: GoalRow[], known: ReadonlySet<string>, now: string) {
  const goals: Goal[] = [];
  const push: GoalRow[] = [];
  const quarantine: unknown[] = [];
  const remoteById = new Map(remote.map(row => [row.id, row]));
  const localIds = new Set(local.map(goal => goal.id));
  const valid = (row: GoalRow) => isGoal(row.data) && row.data.id === row.id ? row.data : undefined;

  for (const goal of local) {
    const row = remoteById.get(goal.id);
    if (!row) { goals.push(goal); push.push(toGoalRow(goal, null, now)); continue; }
    const theirs = valid(row);
    if (goal.achievedAt) {
      goals.push(goal);
      if (!theirs?.achievedAt || row.deleted_at) push.push(toGoalRow(goal, null, now));
    } else if (theirs?.achievedAt) {
      goals.push(theirs);
      if (row.deleted_at) push.push(toGoalRow(theirs, null, now));
    } else if (!row.deleted_at) goals.push(goal);
  }
  for (const row of remote) {
    if (localIds.has(row.id)) continue;
    const theirs = valid(row);
    if (!theirs) { quarantine.push(row.data); continue; }
    if (theirs.achievedAt) { goals.push(theirs); if (row.deleted_at) push.push(toGoalRow(theirs, null, now)); }
    else if (row.deleted_at) continue;
    else if (known.has(row.id)) push.push(toGoalRow(theirs, now, now));
    else goals.push(theirs);
  }
  return { goals, push, quarantine };
}

// Pure. Workouts are immutable, so they are unioned by id; stored `earned` is never
// recalculated and elo is the sum of it. Anything invalid on either side goes to
// quarantine (deduplicated, so repeated syncs don't grow it) instead of being dropped.
export function mergeData(local: SavedData, remoteWorkouts: WorkoutRow[], remoteGoals: GoalRow[], knownGoalIds: ReadonlySet<string>, now = new Date()): Merged {
  const nowIso = now.toISOString();
  const localIds = new Set(local.workouts.map(workout => workout.id));
  const remoteIds = new Set(remoteWorkouts.map(row => row.id));
  const incoming: unknown[] = [];
  const quarantine: unknown[] = [...local.quarantine];
  for (const row of remoteWorkouts) {
    if (localIds.has(row.id)) continue;
    (isRecord(row.data) && row.data.id === row.id ? incoming : quarantine).push(row.data);
  }
  const goals = mergeGoals(local.goals, remoteGoals, knownGoalIds, nowIso);
  const json = JSON.stringify({ version: 3, workouts: [...local.workouts, ...incoming], goals: goals.goals, quarantine: [...quarantine, ...goals.quarantine] });
  // loadData validates and totals; it only reads from the storage it is given.
  const checked = loadData({ getItem: () => json });
  const data: SavedData = {
    ...checked,
    workouts: [...checked.workouts].sort((a, b) => Date.parse(a.completedAt) - Date.parse(b.completedAt)),
    quarantine: dedupe(checked.quarantine),
  };
  return {
    data,
    workoutsToPush: data.workouts.filter(workout => !remoteIds.has(workout.id)),
    goalRowsToPush: goals.push,
    knownGoalIds: data.goals.map(goal => goal.id),
    pulledWorkouts: data.workouts.filter(workout => !localIds.has(workout.id)).length,
  };
}

const SYNC_KEY = "fitrank.sync.v1";
function loadKnownGoalIds(storage: Pick<Storage, "getItem">): Set<string> {
  try {
    const parsed = JSON.parse(storage.getItem(SYNC_KEY) ?? "{}");
    return new Set(Array.isArray(parsed?.goalIds) ? parsed.goalIds.filter((id: unknown) => typeof id === "string") : []);
  } catch { return new Set(); }
}

// Pull, merge into local storage under the save lock, then push what the server lacks.
// The local write happens first, so a failed push loses nothing and is retried next time.
export async function sync(remote: Remote, storage: SyncStorage, lock: <T>(commit: () => T) => Promise<T> = withSaveLock, now = new Date()): Promise<SyncResult> {
  const [remoteWorkouts, remoteGoals] = await Promise.all([remote.pullWorkouts(), remote.pullGoals()]);
  const merged = await lock(() => {
    const result = mergeData(loadData(storage), remoteWorkouts, remoteGoals, loadKnownGoalIds(storage), now);
    writeData(result.data, storage);
    return result;
  });
  const rejected = merged.workoutsToPush.length ? await remote.pushWorkouts(merged.workoutsToPush.map(toWorkoutRow)) : [];
  if (merged.goalRowsToPush.length) await remote.pushGoals(merged.goalRowsToPush);
  storage.setItem(SYNC_KEY, JSON.stringify({ goalIds: merged.knownGoalIds }));
  return { pulled: merged.pulledWorkouts, pushed: merged.workoutsToPush.length - rejected.length, rejected };
}
