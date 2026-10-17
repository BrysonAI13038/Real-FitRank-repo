import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { withSaveLock } from "../workout/storage";
import { supabase } from "./client";
import { createRemote } from "./remote";
import { scopedStorage } from "./scopedStorage";
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
  const running = useRef(false);
  const again = useRef(false);

  const syncNow = useCallback(async () => {
    if (running.current) { again.current = true; return; }
    running.current = true;
    try {
      do {
        again.current = false;
        setStatus(current => ({ ...current, state: "syncing" }));
        try {
          const result = await sync(remote, storage);
          setStatus({ state: "synced", at: Date.now(), rejected: result.rejected });
          setDataVersion(version => version + 1);
        } catch {
          setStatus(current => ({ ...current, state: "error", message: SYNC_FAILED }));
        }
      } while (again.current);
    } finally { running.current = false; }
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

  const value = useMemo<Account>(() => ({ user, storage, sync: status, syncNow: () => void syncNow(), dataVersion, deviceImport, importDevice, declineImport }),
    [user, storage, status, syncNow, dataVersion, deviceImport, importDevice, declineImport]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}
