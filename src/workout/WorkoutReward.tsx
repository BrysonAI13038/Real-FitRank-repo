import { useEffect, useRef, useState } from "react";
import { goalLabel } from "./goals";
import { missedSessionBonus, rankProgress, SESSION_ONCE_A_DAY } from "./scoring";
import type { Reward } from "./storage";
import RankBadge from "../app/RankBadge";
import { rankStyle } from "../app/rankStyle";
import "./workout-success.css";

const ELO_ANIMATION_MS = 1100;

const messages = ["Workout logged. Keep building.", "Another session in the books.", "Progress comes from showing up.", "Keep stacking sessions.", "One workout closer.", "Consistency builds strength."];

export default function WorkoutReward({ reward, onBack }: { reward: Reward; onBack: () => void }) {
  const [position, setPosition] = useState(reward.before);
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    focusRef.current?.focus();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let start: number | null = null;
    const finish = () => { cancelAnimationFrame(frame); setPosition(reward.after); };
    const tick = (time: number) => {
      if (start === null) start = time;
      const progress = Math.min((time - start) / ELO_ANIMATION_MS, 1);
      setPosition(reward.before + (reward.after - reward.before) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    if (preference.matches) finish();
    else frame = requestAnimationFrame(tick);
    const onPreference = () => { if (preference.matches) finish(); };
    preference.addEventListener("change", onPreference);
    return () => { cancelAnimationFrame(frame); preference.removeEventListener("change", onPreference); };
  }, [reward]);
  const progress = rankProgress(position);
  const final = rankProgress(reward.after);
  const sets = reward.workout.exercises.reduce((sum, exercise) => sum + exercise.sets.length, 0);
  return <div ref={focusRef} tabIndex={-1} className="focus:outline-none">
    <p className="mb-3 text-xs font-medium text-[#a7c4b5]">✓ Workout saved</p>
    <h3 className="mb-6 text-[24px] font-semibold leading-tight" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>{messages[(reward.workoutCount - 1) % messages.length]}</h3>
    <div className="fitrank-workout-success mb-6 rounded-[10px] border border-[#1b3a2b] bg-[#0d1f17] px-4 py-6">
      <div className="mb-6 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-3"><RankBadge rank={progress.rank} size={44} /><p className="text-[30px] font-bold" style={{ fontFamily: "Barlow Condensed, sans-serif", color: rankStyle(progress.rank).light }}>{progress.rank}</p></div>
        <span aria-hidden="true" className="fitrank-elo-gain text-lg font-semibold text-[#34d399]">+{reward.earned} ELO</span>
      </div>
      <div role="progressbar" aria-label={final.next ? `${final.rank} progress toward ${final.next}` : "Elite rank achieved"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(final.percent)} aria-valuetext={`${reward.after} ELO. ${final.next ? `${final.remaining} ELO to ${final.next}` : "Elite rank achieved"}`} className="h-4 overflow-hidden rounded-[10px] bg-[#1b3a2b]">
        <div className="h-full rounded-full bg-[linear-gradient(90deg,#10b981,#34d399,#a3e635)] shadow-[0_0_14px_rgba(52,211,153,0.55)]" style={{ width: `${progress.percent}%` }} />
      </div>
      <div className="mt-3 flex justify-between gap-2 text-[11px] leading-relaxed text-[#a7c4b5]"><span>{reward.after.toLocaleString()} ELO</span><span>{final.next ? `${final.remaining.toLocaleString()} to ${final.next}` : "Elite achieved"}</span></div>
      <p role="status" className="sr-only">Workout saved. Earned {reward.earned} ELO. Current rank: {final.rank}.</p>
    </div>
    {reward.goalsAchieved.map(goal => <div key={goal.id} role="status" className="mb-4 rounded-[10px] border border-[#34d399] bg-[#34d399]/10 px-4 py-3 text-xs"><p className="font-semibold uppercase tracking-widest text-[#34d399]">Goal achieved</p><p className="mt-1 text-[#ecfdf5]">{goalLabel(goal)} · +{goal.reward} ELO</p></div>)}
    {reward.workout.breakdown?.length
      ? <><ul aria-label="How this session earned ELO" className="mb-3 space-y-2 text-xs text-[#a7c4b5]">{reward.workout.breakdown.map(line => <li key={line.label} className="flex justify-between gap-3"><span>{line.label}</span><span className="font-semibold text-[#34d399]">+{line.amount}</span></li>)}</ul>
        {missedSessionBonus(reward.workout.breakdown) ? <p className="mb-6 text-xs leading-relaxed text-[#93b3a2]">{SESSION_ONCE_A_DAY}</p> : <div className="mb-3" />}</>
      : reward.earned === 0 && <p className="mb-6 text-xs leading-relaxed text-[#a7c4b5]">No ELO this time. You already earned today's session ELO. Your workout is saved, and nothing is lost.</p>}
    <p className="mb-6 text-xs text-[#93b3a2]">{reward.workout.exercises.length} {reward.workout.exercises.length === 1 ? "exercise" : "exercises"} · {sets} {sets === 1 ? "set" : "sets"} completed</p>
    <button type="button" onClick={onBack} className="w-full cursor-pointer rounded-[10px] bg-[linear-gradient(135deg,#34d399,#a3e635)] px-3 py-3 text-[13px] font-bold text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#34d399]">← Back to home</button>
  </div>;
}
