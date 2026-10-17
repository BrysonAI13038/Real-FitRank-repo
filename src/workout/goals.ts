import { exercises, MAX_REPS, type Workout } from "./model";

export type GoalKind = "weight" | "reps";
// weight: lift at least `target` lbs for one rep. reps: at least `target` reps in one set at >= atWeightLbs.
export type Goal = {
  id: string; exerciseId: string; kind: GoalKind; target: number; atWeightLbs?: number;
  baseline: number; reward: number; createdAt: string; achievedAt?: string; achievedWorkoutId?: string;
};
export type GoalInput = { exerciseId: string; kind: GoalKind; target: number; atWeightLbs?: number };
export type GoalCheck = { ok: true; baseline: number; reward: number } | { ok: false; error: string };

// PROTOTYPE GOAL RULES: tunable. A goal must stretch at least minStretch past your current best.
// Reward scales from baseReward at minStretch up to baseReward + bonusReward at fullRewardStretch.
export const GOAL_RULES = { maxActive: 3, minStretch: 0.05, fullRewardStretch: 0.25, baseReward: 25, bonusReward: 125 };

const EPSILON = 1e-9;
type Past = { exercises: Workout[] }[];
const isDate = (value: unknown) => typeof value === "string" && Number.isFinite(Date.parse(value));

// Sanity checks only, like saved workouts: catalog limits apply to new goals, never to stored ones.
export function isGoal(goal: any): goal is Goal {
  return typeof goal === "object" && goal !== null && !Array.isArray(goal)
    && typeof goal.id === "string" && goal.id !== "" && typeof goal.exerciseId === "string" && goal.exerciseId !== ""
    && (goal.kind === "weight" || goal.kind === "reps")
    && Number.isFinite(goal.target) && goal.target > 0
    && (goal.kind === "weight" ? goal.atWeightLbs === undefined : Number.isFinite(goal.atWeightLbs) && goal.atWeightLbs >= 0)
    && Number.isFinite(goal.baseline) && goal.baseline >= 0
    && Number.isSafeInteger(goal.reward) && goal.reward >= 0 && isDate(goal.createdAt)
    && (goal.achievedAt === undefined || isDate(goal.achievedAt))
    && (goal.achievedWorkoutId === undefined || typeof goal.achievedWorkoutId === "string");
}

const setsFor = (history: Past, exerciseId: string) => history.flatMap(workout => workout.exercises).filter(ex => ex.exerciseId === exerciseId).flatMap(ex => ex.sets);
// Best logged value for this kind of goal: heaviest weight, or most reps in a set at >= atWeightLbs.
export function currentBest(history: Past, exerciseId: string, kind: GoalKind, atWeightLbs = 0): number {
  return setsFor(history, exerciseId).reduce((best, set) => kind === "weight" ? Math.max(best, set.weightLbs) : set.weightLbs >= atWeightLbs ? Math.max(best, set.reps) : best, 0);
}

export function goalReward(baseline: number, target: number): number {
  const stretch = baseline > 0 ? (target - baseline) / baseline : GOAL_RULES.fullRewardStretch;
  const raw = GOAL_RULES.baseReward + GOAL_RULES.bonusReward * Math.min(1, Math.max(0, stretch) / GOAL_RULES.fullRewardStretch);
  return Math.round(raw / 5) * 5;
}

// Anti-farming: the exercise must be logged, the target must be a real stretch past your best,
// and active goals are capped (one active goal per exercise and kind, 3 overall).
export function validateGoal(input: GoalInput, history: Past, goals: Goal[]): GoalCheck {
  const fail = (error: string): GoalCheck => ({ ok: false, error });
  const exercise = exercises.find(item => item.id === input.exerciseId);
  if (!exercise) return fail("Select an exercise from the list.");
  const active = goals.filter(goal => !goal.achievedAt);
  if (active.length >= GOAL_RULES.maxActive) return fail(`You can have at most ${GOAL_RULES.maxActive} active goals.`);
  if (active.some(goal => goal.exerciseId === input.exerciseId && goal.kind === input.kind)) return fail("You already have an active goal of this type for this exercise.");
  if (!setsFor(history, input.exerciseId).length) return fail("Log this exercise at least once before setting a goal for it.");
  if (!Number.isFinite(input.target) || input.target <= 0) return fail("Enter a target above 0.");
  const heaviest = currentBest(history, input.exerciseId, "weight");
  if (input.kind === "weight") {
    if (heaviest <= 0) return fail("You haven’t logged added weight for this exercise yet. Try a reps goal instead.");
    if (input.target > exercise.maxWeightLbs) return fail(`Enter a weight up to ${exercise.maxWeightLbs} lbs.`);
    const min = heaviest * (1 + GOAL_RULES.minStretch);
    if (input.target < min - EPSILON) return fail(`Aim for at least ${Math.ceil(min * 10 - 1e-6) / 10} lbs. Your best so far is ${heaviest} lbs.`);
    return { ok: true, baseline: heaviest, reward: goalReward(heaviest, input.target) };
  }
  const at = input.atWeightLbs;
  if (at === undefined || !Number.isFinite(at) || at < 0) return fail("Enter the weight for this reps goal (0 for bodyweight).");
  if (at > heaviest) return fail(`Choose a weight you’ve already lifted for this exercise (up to ${heaviest} lbs).`);
  if (!Number.isSafeInteger(input.target) || input.target > MAX_REPS) return fail(`Enter a whole number of reps up to ${MAX_REPS}.`);
  const baseline = currentBest(history, input.exerciseId, "reps", at);
  const min = Math.max(baseline + 1, Math.ceil(baseline * (1 + GOAL_RULES.minStretch) - EPSILON));
  if (input.target < min) return fail(`Aim for at least ${min} reps. Your best at ${at} lbs is ${baseline}.`);
  return { ok: true, baseline, reward: goalReward(baseline, input.target) };
}

export function isGoalMet(goal: Goal, session: Workout[]): boolean {
  const exercise = session.find(item => item.exerciseId === goal.exerciseId);
  return !!exercise && exercise.sets.some(set => goal.kind === "weight" ? set.weightLbs >= goal.target : set.reps >= goal.target && set.weightLbs >= (goal.atWeightLbs ?? 0));
}
