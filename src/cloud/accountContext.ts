import { createContext, useContext } from "react";
import type { ScopedStorage } from "./scopedStorage";
import type { DeviceImportState } from "./deviceImport";
import type { CloudUser } from "./useSession";

// Kept apart from account.tsx (which pulls in the Supabase client) so screens can use the
// account without it, and tests can render them with a fake one.
export type SyncStatus = { state: "idle" | "syncing" | "synced" | "error"; at?: number; rejected: string[]; message?: string };
export type Account = {
  user: CloudUser;
  // This account's data on this device. Pass it to the functions in src/workout.
  storage: ScopedStorage;
  sync: SyncStatus;
  syncNow: () => void;
  // Bumps after a sync or import changes local data, so screens can reload.
  dataVersion: number;
  deviceImport: DeviceImportState | null;
  importDevice: () => Promise<number>;
  declineImport: () => void;
};

export const AccountContext = createContext<Account | null>(null);
export function useAccount(): Account {
  const account = useContext(AccountContext);
  if (!account) throw new Error("useAccount must be used inside AccountProvider.");
  return account;
}

