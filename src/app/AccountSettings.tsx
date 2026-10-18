import { useState } from "react";
import { useAccount } from "../cloud/accountContext";
import type { SavedData } from "../workout/storage";
import { downloadExport } from "./exportData";

const DELETE_WORD = "DELETE";
const UNSYNCED_WARNING = "Some changes haven’t reached your account yet. If you sign out, they stay on this device and sync the next time you sign in. Sign out anyway?";

export default function AccountSettings({ data }: { data: SavedData | null }) {
  const { user, sync, syncNow, signOut, deleteAccount, deviceImport, importDevice } = useAccount();
  const [busy, setBusy] = useState<"" | "sync" | "signout" | "import" | "delete">("");
  const [message, setMessage] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const canImport = deviceImport && (deviceImport.status === "declined" || deviceImport.status === "offered");

  const syncLine = sync.state === "syncing" ? "Syncing…"
    : sync.state === "error" ? (sync.message ?? "Couldn’t sync.")
    : sync.at ? `Synced at ${new Date(sync.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.` : "Not synced yet.";

  async function run(kind: typeof busy, work: () => Promise<void>, failure: string) {
    if (busy) return;
    setBusy(kind); setMessage("");
    try { await work(); } catch { setMessage(failure); }
    setBusy("");
  }
  const exportNow = () => {
    if (!data) return;
    try { downloadExport(data); setMessage("Your data export is ready to download."); }
    catch { setMessage("Couldn’t export your data. Please try again."); }
  };
  const signOutNow = () => run("signout", async () => {
    // Try to sync first so nothing is left behind; warn only if that fails.
    const synced = await syncNow();
    if (!synced && !window.confirm(UNSYNCED_WARNING)) return;
    await signOut();
  }, "Couldn’t sign out. Please try again.");
  const importNow = () => run("import", async () => {
    const count = await importDevice();
    setMessage(`Imported ${count} ${count === 1 ? "workout" : "workouts"} from this device.`);
  }, "Couldn’t import. Nothing on this device was changed. Try again.");
  const deleteNow = () => {
    if (confirmText.trim() !== DELETE_WORD) return;
    return run("delete", () => deleteAccount(), "Couldn’t delete your account. Nothing was deleted. Check your connection and try again.");
  };

  return <>
    <section className="app-card app-account" aria-labelledby="account-title">
      <h2 id="account-title">Account</h2>
      <p>Signed in as <strong>{user.email ?? "your account"}</strong>.</p>
      <p>Your workouts and ELO are saved to your account and kept on this device, so FitRank still works offline.</p>
      <p role="status">{syncLine}</p>
      {sync.rejected.length > 0 && <p role="alert">{sync.rejected.length} {sync.rejected.length === 1 ? "workout" : "workouts"} couldn’t be uploaded. {sync.rejected.length === 1 ? "It is" : "They are"} still saved on this device.</p>}
      <div className="app-account-actions">
        <button type="button" className="app-button app-secondary" onClick={() => run("sync", async () => { if (!(await syncNow())) setMessage("Couldn’t sync. Check your connection and try again."); }, "Couldn’t sync.")} disabled={!!busy || sync.state === "syncing"}>Sync now</button>
        <button type="button" className="app-button app-secondary" onClick={signOutNow} disabled={!!busy}>Sign out</button>
      </div>
      {canImport && <>
        <h3>Workouts from before accounts</h3>
        <p>This device has {deviceImport.workouts} {deviceImport.workouts === 1 ? "workout" : "workouts"} saved from before accounts. Only this account can import {deviceImport.workouts === 1 ? "it" : "them"}.</p>
        <button type="button" className="app-button app-secondary" onClick={importNow} disabled={!!busy}>Import data from this device</button>
      </>}
      <p role="status">{message}</p>
    </section>
    <section className="app-card app-account" aria-labelledby="data-title">
      <h2 id="data-title">Your data</h2>
      <p>Download everything saved for your account as a JSON file.</p>
      <button type="button" className="app-button app-secondary" onClick={exportNow} disabled={!data}>Export my data</button>
      <h3>Delete account</h3>
      <p>This permanently deletes your account, workouts, goals and ELO from our servers and from this device. It can’t be undone, so export your data first if you want a copy. Anything saved in this browser from before accounts isn’t removed; clear this site’s data in your browser settings to remove it.</p>
      <label htmlFor="delete-confirm">Type {DELETE_WORD} to confirm</label>
      <input id="delete-confirm" className="app-input" value={confirmText} onChange={event => setConfirmText(event.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
      <button type="button" className="app-button app-danger" onClick={deleteNow} disabled={!!busy || confirmText.trim() !== DELETE_WORD}>Delete my account</button>
    </section>
  </>;
}
