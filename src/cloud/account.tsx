import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { withSaveLock } from "../workout/storage";
import { supabase } from "./client";
import { createRemote } from "./remote";
import { clearScoped, scopedStorage } from "./scopedStorage";
import { sync } from "./sync";
import { deviceImportState, importDeviceData, setImportStatus } from "./deviceImport";
import { AccountContext, type Account, type SyncStatus } from "./accountContext";
import type { CloudUser } from "./useSession";

const SYNC_FAILED = "Couldn’t sync. Your workouts are saved on this device and will sync when you’re back online.";

// Rendered only while signed in (keyed by user id, so switching accounts remounts it).
export function AccountProvider({ user, children }: { user: CloudUser; children: ReactNode }) {
  const storage = useMemo(() => scopedStorage(user.id), [user.id]);
  const remote = useMemo(() => createRemote(supabase!), []);
  const [status, setStatus] = useState<SyncStatus>({ state: "idle", rejected: [] });
  const [dataVersion, setDataVersion] = useState(0);
  const [deviceImport, setDeviceImport] = useState(() => deviceImportState(user.id, localStorage));
  const current = useRef<Promise<boolean> | null>(null);
  const again = useRef(false);
  const closed = useRef(false);

  // One sync at a time. A request that arrives mid-sync shares that run and asks for one more pass.
  const syncNow = useCallback((): Promise<boolean> => {
    if (closed.current) return Promise.resolve(false);
    if (current.current) { again.current = true; return current.current; }
    const run = (async () => {
      let ok = true;
      try {
        do {
          again.current = false;
          setStatus(previous => ({ ...previous, state: "syncing" }));
          try {
            const result = await sync(remote, storage);
            ok = true;
            setStatus({ state: "synced", at: Date.now(), rejected: result.rejected });
            setDataVersion(version => version + 1);
          } catch {
            ok = false;
            setStatus(previous => ({ ...previous, state: "error", message: SYNC_FAILED }));
          }
        } while (again.current && !closed.current);
      } finally { current.current = null; }
      return ok;
    })();
    current.current = run;
    return run;
  }, [remote, storage]);

  useEffect(() => {
    void syncNow();
    const trigger = () => void syncNow();
    window.addEventListener("online", trigger);
    window.addEventListener("focus", trigger);
    return () => { window.removeEventListener("online", trigger); window.removeEventListener("focus", trigger); };
  }, [syncNow]);

  const importDevice = useCallback(async () => {
    const count = await withSaveLock(() => importDeviceData(user.id, localStorage, storage));
    setDeviceImport(deviceImportState(user.id, localStorage));
    setDataVersion(version => version + 1);
    void syncNow();
    return count;
  }, [user.id, storage, syncNow]);
  const declineImport = useCallback(() => {
    try { setImportStatus(user.id, "declined", localStorage); } catch { /* the prompt just returns next time */ }
    setDeviceImport(deviceImportState(user.id, localStorage));
  }, [user.id]);

  const signOut = useCallback(async () => {
    await supabase!.auth.signOut({ scope: "local" });
  }, []);
  const deleteAccount = useCallback(async () => {
    await current.current;
    const { error } = await supabase!.rpc("delete_account");
    if (error) throw new Error(error.message);
    // The account is gone: stop syncing, drop its data on this device, and end the session.
    closed.current = true;
    clearScoped(user.id);
    await supabase!.auth.signOut({ scope: "local" }).catch(() => undefined);
  }, [user.id]);

  const value = useMemo<Account>(() => ({ user, storage, sync: status, syncNow, dataVersion, deviceImport, importDevice, declineImport, signOut, deleteAccount }),
    [user, storage, status, syncNow, dataVersion, deviceImport, importDevice, declineImport, signOut, deleteAccount]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
