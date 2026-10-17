import { loadData, writeData, type SavedData } from "../workout/storage";
import { mergeData, toWorkoutRow } from "./sync";

// Workouts logged before accounts exist live in unscoped localStorage keys (v3, v2 or v1).
// They can be copied into an account once per DEVICE: the first account to sign in on a
// device that has such data is the only one that is ever offered it. A second account
// (a family member, a new sign-in after the first was deleted) never sees the offer.
// The original keys are only read, never modified or deleted.
export type DeviceImportStatus = "offered" | "declined" | "imported";
export type DeviceImportState = { status: DeviceImportStatus; workouts: number; goals: number };
type Base = Pick<Storage, "getItem" | "setItem">;
type DeviceRecord = { uid: string; status: DeviceImportStatus };

export const DEVICE_IMPORT_KEY = "fitrank.deviceImport";
const STATUSES: DeviceImportStatus[] = ["offered", "declined", "imported"];

function readRecord(base: Pick<Storage, "getItem">): DeviceRecord | null {
  try {
    const parsed = JSON.parse(base.getItem(DEVICE_IMPORT_KEY) ?? "null");
    return typeof parsed?.uid === "string" && STATUSES.includes(parsed.status) ? parsed : null;
  } catch { return null; }
}
// null when there is nothing to import or the old data can't be read (it is left alone).
function deviceData(base: Pick<Storage, "getItem">): SavedData | null {
  try {
    const data = loadData(base);
    return data.workouts.length || data.goals.length ? data : null;
  } catch { return null; }
}

// Claims the device for `uid` on first use. Returns null for every other account, and when
// there is nothing to import. If the claim can't be written we offer nothing, so a second
// account can't be offered someone else's data.
export function deviceImportState(uid: string, base: Base): DeviceImportState | null {
  let record = readRecord(base);
  const data = deviceData(base);
  if (!record) {
    if (!data) return null;
    record = { uid, status: "offered" };
    try { base.setItem(DEVICE_IMPORT_KEY, JSON.stringify(record)); } catch { return null; }
  }
  if (record.uid !== uid) return null;
  if (!data && record.status !== "imported") return null;
  return { status: record.status, workouts: data?.workouts.length ?? 0, goals: data?.goals.length ?? 0 };
}

export function setImportStatus(uid: string, status: "declined", base: Base): void {
  const record = readRecord(base);
  if (record?.uid === uid && record.status !== "imported") base.setItem(DEVICE_IMPORT_KEY, JSON.stringify({ uid, status }));
}

// Unions the device data into the account's storage (so workouts already logged under the
// account are kept) and marks the device as imported. Safe to retry. Callers hold the save
// lock. Returns how many workouts were new to the account.
export function importDeviceData(uid: string, base: Base, scoped: Base, now = new Date()): number {
  const record = readRecord(base);
  if (record?.uid !== uid || record.status === "imported") throw new Error("This device’s data isn’t available to import for this account.");
  const device = loadData(base);
  const local = loadData(scoped);
  const merged = mergeData(
    { ...local, quarantine: [...local.quarantine, ...device.quarantine] },
    device.workouts.map(toWorkoutRow),
    device.goals.map(goal => ({ id: goal.id, data: goal, deleted_at: null, updated_at: now.toISOString() })),
    new Set(), now,
  );
  writeData(merged.data, scoped);
  base.setItem(DEVICE_IMPORT_KEY, JSON.stringify({ uid, status: "imported" }));
  return merged.pulledWorkouts;
}
