import { useId, useState, type FormEvent } from "react";
import { exercises } from "../workout/model";
import { addGoal, deleteGoal, withSaveLock, type SavedData } from "../workout/storage";
import { currentBest, GOAL_RULES, GoalError, goalLabel, validateGoal, type GoalInput, type GoalKind } from "../workout/goals";

const num = (text: string) => text.trim() === "" ? NaN : Number(text);
const date = (iso?: string) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "";

export default function Goals({ data, onChange }: { data: SavedData; onChange?: () => void }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [exerciseId, setExerciseId] = useState("");
  const [kind, setKind] = useState<GoalKind>("weight");
  const [target, setTarget] = useState("");
  const [atWeight, setAtWeight] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const active = data.goals.filter(goal => !goal.achievedAt);
  const achieved = data.goals.filter(goal => goal.achievedAt).sort((a, b) => Date.parse(b.achievedAt!) - Date.parse(a.achievedAt!));
  const logged = new Set(data.workouts.flatMap(workout => workout.exercises.map(exercise => exercise.exerciseId)));
  const options = exercises.filter(exercise => logged.has(exercise.id)).sort((a, b) => a.name.localeCompare(b.name));
  const full = active.length >= GOAL_RULES.maxActive;
  const input: GoalInput = { exerciseId, kind, target: num(target), atWeightLbs: kind === "reps" ? num(atWeight) : undefined };
  const check = exerciseId && target.trim() ? validateGoal(input, data.workouts, data.goals) : null;

  function pickExercise(value: string) {
    setExerciseId(value);
    if (value) setAtWeight(String(currentBest(data.workouts, value, "weight")));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!check?.ok || busy) return;
    setBusy(true);
    setMessage("");
    try {
      await withSaveLock(() => addGoal(input, crypto.randomUUID()));
      setOpen(false); setExerciseId(""); setTarget(""); setAtWeight("");
      onChange?.();
    } catch (cause) {
      setMessage(cause instanceof GoalError || (cause instanceof Error && cause.message.includes("Nothing was overwritten")) ? cause.message : "Couldn’t save your goal. Check browser storage and try again.");
    } finally { setBusy(false); }
  }
  async function remove(goalId: string) {
    setMessage("");
    try { await withSaveLock(() => deleteGoal(goalId)); onChange?.(); }
    catch { setMessage("Couldn’t remove that goal. Check browser storage and try again."); }
  }

  return <section className="app-card app-goals" aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`}>Goals</h2>
    <p>Set a weight or reps target for an exercise you’ve logged. Hit it in a later workout to earn bonus ELO. The reward is fixed when you create the goal, and bigger stretches pay more.</p>
    {active.length > 0 && <ul className="app-goals-list" aria-label="Active goals">{active.map(goal => <li className="app-goal" key={goal.id}>
      <div><h3>{goalLabel(goal)}</h3><p>Now: {currentBest(data.workouts, goal.exerciseId, goal.kind, goal.atWeightLbs)} {goal.kind === "weight" ? "lbs" : "reps"} · started at {goal.baseline}</p></div>
      <div className="app-goal-side"><span className="app-goal-reward">+{goal.reward} ELO</span><button type="button" className="app-button app-secondary app-small" aria-label={`Remove goal ${goalLabel(goal)}`} onClick={() => remove(goal.id)}>Remove</button></div>
    </li>)}</ul>}
    {!open && <>
      {!options.length ? <p>Log a workout first, then you can set a goal for one of your exercises.</p> : full ? <p>You have {GOAL_RULES.maxActive} active goals. Reach or remove one to add another.</p>
        : <button type="button" className="app-button" onClick={() => setOpen(true)}>+ Set a goal</button>}
    </>}
    {open && <form className="app-form" onSubmit={submit} aria-label="New goal">
      <label>Exercise
        <select value={exerciseId} onChange={event => pickExercise(event.target.value)} required>
          <option value="">Choose an exercise</option>
          {options.map(exercise => <option key={exercise.id} value={exercise.id}>{exercise.name}</option>)}
        </select>
      </label>
      <label>Goal type
        <select value={kind} onChange={event => setKind(event.target.value as GoalKind)}>
          <option value="weight">Lift more weight</option>
          <option value="reps">Do more reps</option>
        </select>
      </label>
      {kind === "reps" && <label>At weight (lbs, 0 for bodyweight)
        <input inputMode="decimal" value={atWeight} onChange={event => setAtWeight(event.target.value)} required />
      </label>}
      <label>{kind === "weight" ? "Target weight (lbs)" : "Target reps in one set"}
        <input inputMode="decimal" value={target} onChange={event => setTarget(event.target.value)} required />
      </label>
      <p className="app-form-note" role="status">{check ? check.ok ? <span className="app-accent">Reward: +{check.reward} ELO when you reach it (from {check.baseline} {kind === "weight" ? "lbs" : "reps"}).</span> : check.error : "Aim at least 5% above your current best."}</p>
      <div className="app-actions">
        <button type="submit" className="app-button" disabled={!check?.ok || busy}>Create goal</button>
        <button type="button" className="app-button app-secondary" onClick={() => { setOpen(false); setMessage(""); }}>Cancel</button>
      </div>
    </form>}
    {message && <p role="alert" className="app-accent">{message}</p>}
    {achieved.length > 0 && <>
      <h3 className="app-goals-subhead">Achieved</h3>
      <ul className="app-goals-list" aria-label="Achieved goals">{achieved.map(goal => <li className="app-goal" key={goal.id}>
        <div><h3>{goalLabel(goal)}</h3><p>Reached {date(goal.achievedAt)}</p></div>
        <span className="app-goal-reward">+{goal.reward} ELO</span>
      </li>)}</ul>
    </>}
  </section>;
}
