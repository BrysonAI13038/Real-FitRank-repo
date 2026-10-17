import { useRef, useState } from "react";
import "../instrument-atmosphere.css";
import WorkoutInput from "./WorkoutInput";
import WorkoutReward from "./WorkoutReward";
import { saveWorkout, withSaveLock, type Reward } from "./storage";
import { clearDraft } from "./draft";
import type { Workout } from "./model";
import { useAccount } from "../cloud/accountContext";

export default function WorkoutLogger({ onBack, onSaved }: { onBack: () => void; onSaved?: () => void }) {
  const { storage } = useAccount();
  const [reward, setReward] = useState<Reward | null>(null);
  const [error, setError] = useState("");
  const submissionId = useRef<string | null>(null);
  const submitting = useRef(false);
  async function submit(exercises: Workout[]) {
    if (submitting.current) return;
    submitting.current = true;
    setError("");
    try {
      submissionId.current ??= crypto.randomUUID();
      const commit = () => saveWorkout(exercises, submissionId.current!, storage);
      const saved = await withSaveLock(commit);
      clearDraft(storage);
      setReward(saved);
      onSaved?.();
    } catch (cause) {
      setError(cause instanceof Error && cause.message.includes("Nothing was overwritten") ? cause.message : "Couldn’t save your workout. Check browser storage and try again. Your inputs are still here.");
      submitting.current = false;
    }
  }
  return <section style={{ fontFamily: "Inter, sans-serif", colorScheme: "dark" }} className="fitrank-workout-surface text-[#f4f4f5]">
    <h2 className="mb-6 border-b border-[#26262b] pb-4 text-[22px] font-bold tracking-wide" style={{ fontFamily: "Barlow Condensed, sans-serif" }}>{reward ? "SESSION COMPLETE" : "LOG WORKOUT"}</h2>
    {error && <p role="alert" className="mb-4 text-xs leading-relaxed text-[#f59e0b]">{error}</p>}
    {reward ? <WorkoutReward reward={reward} onBack={onBack} /> : <WorkoutInput onSubmit={submit} onCancel={onBack} />}
  </section>;
}
