import { useState } from "react";
import { useAccount } from "../cloud/accountContext";

// Shown once, to the first account that signs in on a device that has workouts saved
// from before accounts. Other accounts on the device never see it.
export default function ImportPrompt() {
  const { deviceImport, importDevice, declineImport } = useAccount();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (deviceImport?.status !== "offered") return null;
  const count = deviceImport.workouts;
  async function accept() {
    setBusy(true); setMessage("");
    try { await importDevice(); }
    catch { setMessage("Couldn’t import. Nothing on this device was changed. Try again."); setBusy(false); }
  }
  return <section className="app-card app-import" aria-labelledby="import-title">
    <h2 id="import-title">Import your saved workouts?</h2>
    <p>This device has {count} {count === 1 ? "workout" : "workouts"} saved from before accounts. Import {count === 1 ? "it" : "them"} into your account so {count === 1 ? "it syncs" : "they sync"} across your devices. The copy on this device stays as it is.</p>
    <p>If you choose Not now, you can import later from Settings.</p>
    <button type="button" className="app-button" onClick={accept} disabled={busy}>Import {count} {count === 1 ? "workout" : "workouts"}</button>
    <button type="button" className="app-button app-secondary" onClick={declineImport} disabled={busy}>Not now</button>
    {message && <p role="alert">{message}</p>}
  </section>;
}
