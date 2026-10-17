import { exercises } from "./exercises";
import type { SessionEntry } from "./model";

// In-progress session, kept apart from saved workouts so it can never affect history or ELO.
const KEY = "fitrank.draft.v1";
const isRecord = (value: unknown): value is Record<string, any> => typeof value === "object" && value !== null && !Array.isArray(value);

// Tolerant: unknown exercises, repeats and malformed sets are dropped. Anything unreadable gives an empty draft.
export function loadDraft(storage: Pick<Storage, "getItem"> = localStorage): SessionEntry[] {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== 1 || !Array.isArray(data.entries)) return [];
    const seen = new Set<string>();
    const entries: SessionEntry[] = [];
    for (const entry of data.entries) {
      if (!isRecord(entry) || typeof entry.exerciseId !== "string" || seen.has(entry.exerciseId)) continue;
      if (!exercises.some(exercise => exercise.id === entry.exerciseId) || !Array.isArray(entry.sets)) continue;
      const sets = entry.sets
        .filter((set: unknown) => isRecord(set) && typeof set.weight === "string" && typeof set.reps === "string")
        .map((set: { weight: string; reps: string }) => ({ weight: set.weight, reps: set.reps }));
      seen.add(entry.exerciseId);
      entries.push({ exerciseId: entry.exerciseId, sets: sets.length ? sets : [{ weight: "", reps: "" }] });
    }
    return entries;
  } catch { return []; }
}

// Returns false when storage is blocked or full; the session keeps working without a draft.
export function saveDraft(entries: SessionEntry[], storage: Pick<Storage, "setItem" | "removeItem"> = localStorage): boolean {
  try {
    if (!entries.length) storage.removeItem(KEY);
    else storage.setItem(KEY, JSON.stringify({ version: 1, entries }));
    return true;
  } catch { return false; }
}

export function clearDraft(storage: Pick<Storage, "removeItem"> = localStorage): boolean {
  try { storage.removeItem(KEY); return true; } catch { return false; }
}
