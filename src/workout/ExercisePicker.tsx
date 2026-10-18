import { useId, useState } from "react";
import { MUSCLE_GROUPS, searchExercises, type MuscleGroup } from "./exercises";

const field = "w-full rounded-[8px] border border-[#1b3a2b] bg-[#0d1f17] px-3 py-2.5 text-sm text-[#ecfdf5] outline-none focus:border-[#34d399]";
const chip = (active: boolean) => `rounded-[8px] border px-2 py-1 text-[10px] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#34d399] ${active ? "border-[#34d399] bg-[#34d399]/10 text-[#34d399]" : "border-[#1b3a2b] text-[#93b3a2]"}`;

export default function ExercisePicker({ added, disabled, onPick, onClose }: { added: string[]; disabled?: string; onPick: (exerciseId: string) => void; onClose: () => void }) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<MuscleGroup | undefined>();
  const results = searchExercises(query, group);
  return <div className="my-3 rounded-[10px] border border-[#1b3a2b] bg-[#0d1f17] p-3">
    <label htmlFor={`${id}-search`} className="mb-2 block text-[10px] uppercase tracking-widest text-[#93b3a2]">Find an exercise</label>
    <input id={`${id}-search`} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name or muscle group" className={field} autoFocus />
    <div className="my-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by muscle group">
      <button type="button" aria-pressed={!group} className={chip(!group)} onClick={() => setGroup(undefined)}>All</button>
      {MUSCLE_GROUPS.map(name => <button key={name} type="button" aria-pressed={group === name} className={chip(group === name)} onClick={() => setGroup(group === name ? undefined : name)}>{name}</button>)}
    </div>
    {disabled && <p className="mb-2 text-xs text-[#34d399]">{disabled}</p>}
    <ul className="max-h-56 overflow-y-auto">
      {results.map(item => {
        const isAdded = added.includes(item.id);
        return <li key={item.id}><button type="button" disabled={isAdded || !!disabled} onClick={() => onPick(item.id)} className="flex w-full items-center justify-between gap-2 rounded-[8px] px-2 py-2 text-left text-xs text-[#c8dccf] enabled:hover:bg-[#34d399]/10 enabled:cursor-pointer disabled:text-[#3c6350] focus-visible:outline-2 focus-visible:outline-[#34d399]">
          <span>{item.name}<span className="mt-0.5 block text-[9px] text-[#93b3a2]">{[item.primary, ...item.secondary].join(" · ")}</span></span>
          {isAdded && <span className="text-[9px] uppercase tracking-widest">Added</span>}
        </button></li>;
      })}
      {!results.length && <li className="p-2 text-xs text-[#93b3a2]">No matches. Try another exercise or muscle group.</li>}
    </ul>
    <button type="button" onClick={onClose} className="mt-3 text-[11px] text-[#93b3a2] underline cursor-pointer">Close</button>
  </div>;
}
