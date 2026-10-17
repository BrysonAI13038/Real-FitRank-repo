import { useEffect, useId, useRef, useState } from "react";
import ExercisePicker from "./ExercisePicker";
import { clearDraft, loadDraft, saveDraft } from "./draft";
import { exercises, MAX_EXERCISES, MAX_SETS, processSession, type SessionErrors, type SetInput, type Workout } from "./model";

const field = "w-full rounded-[1px] border border-[#26262b] bg-[#161618] px-3 py-2.5 text-sm text-[#f4f4f5] outline-none focus:border-[#f59e0b]";
const primary = "w-full rounded-[1px] bg-[#f59e0b] px-3 py-3 text-[13px] font-semibold text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f59e0b] cursor-pointer";
const secondary = "w-full rounded-[1px] border border-[#3f3f46] px-3 py-3 text-xs text-[#a1a1aa] hover:text-white focus-visible:outline-2 focus-visible:outline-[#f59e0b] cursor-pointer disabled:cursor-not-allowed disabled:opacity-50";

type SetRow = SetInput & { id: number };
type Entry = { exerciseId: string; sets: SetRow[] };

export default function WorkoutInput({ onSubmit, onCancel }: { onSubmit: (exercises: Workout[]) => void; onCancel: () => void }) {
  const prefix = useId();
  const nextId = useRef(0);
  const row = (set: SetInput = { weight: "", reps: "" }): SetRow => ({ id: nextId.current++, weight: set.weight, reps: set.reps });
  const [entries, setEntries] = useState<Entry[]>(() => loadDraft().map(entry => ({ exerciseId: entry.exerciseId, sets: entry.sets.map(set => row(set)) })));
  const [picking, setPicking] = useState(false);
  const [errors, setErrors] = useState<SessionErrors>({ entries: [] });
  const full = entries.length >= MAX_EXERCISES;

  useEffect(() => {
    saveDraft(entries.map(entry => ({ exerciseId: entry.exerciseId, sets: entry.sets.map(({ weight, reps }) => ({ weight, reps })) })));
  }, [entries]);

  const update = (exerciseId: string, change: (sets: SetRow[]) => SetRow[]) =>
    setEntries(current => current.map(entry => entry.exerciseId === exerciseId ? { ...entry, sets: change(entry.sets) } : entry));
  const resetErrors = () => setErrors({ entries: [] });

  return <form noValidate onSubmit={event => {
    event.preventDefault();
    const result = processSession(entries);
    if (result.ok) onSubmit(result.exercises);
    else setErrors(result.errors);
  }}>
    <p className="mb-3 text-[11px] leading-relaxed text-[#a1a1aa]">Add up to {MAX_EXERCISES} exercises, then log weight and reps for each set. Use 0 lbs for bodyweight sets. Your session is saved on this device as you go.</p>
    {!entries.length && <p className="mb-3 rounded-[2px] border border-dashed border-[#26262b] p-4 text-xs text-[#a1a1aa]">No exercises yet. Add your first one below.</p>}
    <div className="space-y-4">{entries.map((entry, entryIndex) => {
      const info = exercises.find(item => item.id === entry.exerciseId);
      const entryErrors = errors.entries[entryIndex];
      return <section key={entry.exerciseId} aria-label={info?.name} className="rounded-[2px] border border-[#26262b] p-3">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div><h3 className="text-sm font-semibold text-[#f4f4f5]">{info?.name ?? entry.exerciseId}</h3>
            {info && <p className="mt-0.5 text-[10px] text-[#a1a1aa]">{[info.primary, ...info.secondary].join(" · ")}</p>}</div>
          <button type="button" aria-label={`Remove ${info?.name ?? entry.exerciseId}`} onClick={() => { setEntries(current => current.filter(item => item.exerciseId !== entry.exerciseId)); resetErrors(); }} className="text-[11px] text-[#a1a1aa] underline cursor-pointer">Remove</button>
        </div>
        {entryErrors?.exercise && <p role="alert" className="mb-2 text-xs text-[#f59e0b]">{entryErrors.exercise}</p>}
        <div className="space-y-3">{entry.sets.map((set, index) => <fieldset key={set.id} className="rounded-[2px] border border-[#26262b] bg-[#161618] p-3">
          <legend className="px-1 text-[10px] uppercase tracking-widest text-[#a1a1aa]">Set {index + 1}</legend>
          <div className="grid grid-cols-2 gap-3">{(["weight", "reps"] as const).map(key => {
            const error = entryErrors?.rows[index]?.[key];
            const id = `${prefix}-${set.id}-${key}`;
            return <div key={key}><label htmlFor={id} className="mb-2 block text-[10px] text-[#a1a1aa]">{key === "weight" ? "Weight (lbs)" : "Reps"}</label>
              <input id={id} type="number" min={key === "weight" ? 0 : 1} step={key === "weight" ? "any" : 1} inputMode={key === "weight" ? "decimal" : "numeric"} value={set[key]} required aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} onChange={event => update(entry.exerciseId, sets => sets.map(item => item.id === set.id ? { ...item, [key]: event.target.value } : item))} className={field} />
              {error && <p id={`${id}-error`} role="alert" className="mt-2 text-[10px] text-[#f59e0b]">{error}</p>}
            </div>;
          })}</div>
          {entry.sets.length > 1 && <button type="button" aria-label={`Remove set ${index + 1} of ${info?.name ?? entry.exerciseId}`} onClick={() => { update(entry.exerciseId, sets => sets.filter(item => item.id !== set.id)); resetErrors(); }} className="mt-3 text-[11px] text-[#a1a1aa] underline cursor-pointer">Remove set</button>}
        </fieldset>)}</div>
        {entryErrors?.sets && <p role="alert" className="mt-3 text-xs text-[#f59e0b]">{entryErrors.sets}</p>}
        <button type="button" disabled={entry.sets.length >= MAX_SETS} className={`${secondary} mt-3`} onClick={() => update(entry.exerciseId, sets => [...sets, row(sets[sets.length - 1] ? { weight: sets[sets.length - 1].weight, reps: sets[sets.length - 1].reps } : undefined)])}>+ Add set{entry.sets.length >= MAX_SETS ? ` (max ${MAX_SETS})` : ""}</button>
      </section>;
    })}</div>
    {errors.session && <p role="alert" className="mt-3 text-xs text-[#f59e0b]">{errors.session}</p>}
    {picking && <ExercisePicker added={entries.map(entry => entry.exerciseId)} disabled={full ? `Max ${MAX_EXERCISES} exercises per session.` : undefined} onClose={() => setPicking(false)} onPick={exerciseId => {
      setEntries(current => [...current, { exerciseId, sets: [row()] }]);
      resetErrors();
      setPicking(false);
    }} />}
    <div className="mt-4 space-y-3">
      {!picking && <button type="button" disabled={full} className={secondary} onClick={() => setPicking(true)}>{full ? `Max ${MAX_EXERCISES} exercises per session` : "+ Add exercise"}</button>}
      <button type="submit" className={primary}>Finish session →</button>
      {entries.length > 0 && <button type="button" className={secondary} onClick={() => { if (window.confirm("Discard this session? Your entries will be cleared.")) { clearDraft(); setEntries([]); resetErrors(); } }}>Discard session</button>}
      <button type="button" className={secondary} onClick={onCancel}>← Back</button>
    </div>
  </form>;
}
