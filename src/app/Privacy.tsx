// A plain-language description of what FitRank stores and where. It describes what the app
// does today; if analytics, ads or a new service are ever added, update this page first.
import { TERMS_HREF } from "./legalLinks";

const UPDATED = "October 18, 2026";

export default function Privacy({ signedIn }: { signedIn: boolean }) {
  return <article className="app-card app-privacy" aria-labelledby="privacy-title">
    <p className="app-label">Last updated {UPDATED}</p>
    <h1 id="privacy-title">Privacy</h1>
    <p>FitRank is a workout tracker. This page explains what it stores, where it lives, and how you can take it with you or delete it.</p>

    <h2>What is stored</h2>
    <ul>
      <li><strong>Your email address,</strong> to sign you in. When you sign in with Google, Google shares your name, email address and profile picture link with the sign-in service, which keeps them in your account record. FitRank only uses your email address.</li>
      <li><strong>Your workouts:</strong> the date, the exercises, and the weight and reps of each set, plus how each session earned its ELO.</li>
      <li><strong>Your goals,</strong> and your ELO and rank, which are worked out from your workouts.</li>
    </ul>

    <h2>Where it is stored</h2>
    <ul>
      <li><strong>On your device.</strong> Each account keeps a copy in your browser so FitRank works offline. This includes a sign-in token, which keeps you signed in.</li>
      <li><strong>In a database hosted by Supabase,</strong> so your progress follows you to other devices. Only you can read or change your own rows.</li>
      <li><strong>Netlify</strong> hosts the app itself. Netlify and Supabase may keep standard server logs, such as IP addresses, as part of running their services.</li>
    </ul>

    <h2>What FitRank does not do</h2>
    <p>No ads. No analytics. No tracking cookies. Your data is not sold or shared with anyone, and nothing is posted anywhere.</p>

    <h2>Your controls</h2>
    <ul>
      <li><strong>Export my data</strong> (Settings) downloads everything saved for your account as a file.</li>
      <li><strong>Delete account</strong> (Settings) permanently removes your account, workouts and goals from the database, and clears that account’s copy on the device you use. If you used FitRank on other devices, their copies stay there until you clear this site’s data in that browser.</li>
      <li>Workouts saved in a browser from before accounts existed are not removed by Delete account. Clear this site’s data in your browser settings to remove them.</li>
    </ul>

    <h2>Backups</h2>
    <p>FitRank does not keep its own backups. The services above may keep backups for a limited time under their own policies.</p>

    <h2>Questions</h2>
    <p>There is no contact address or form yet. You can export or delete your data yourself at any time in Settings.</p>
    <p>If this page changes, the date at the top changes too. See also the <a href={TERMS_HREF}>Terms of service</a>.</p>

    <a className="app-button app-secondary" href={signedIn ? "#/settings" : "#/home"}>{signedIn ? "Back to Settings" : "Back to sign in"}</a>
  </article>;
}
