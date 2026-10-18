import { PRIVACY_HREF } from "./legalLinks";

// A plain-language description of how FitRank may be used. It is not lawyer-reviewed
// legal advice; have it reviewed before promoting the app widely or releasing it in a store.
const UPDATED = "October 18, 2026";

export default function Terms({ signedIn }: { signedIn: boolean }) {
  return <article className="app-card app-privacy" aria-labelledby="terms-title">
    <p className="app-label">Last updated {UPDATED}</p>
    <h1 id="terms-title">Terms of service</h1>
    <p>FitRank is a free workout tracker. By signing in or using it, you agree to these terms. They are short on purpose.</p>

    <h2>What FitRank is</h2>
    <p>FitRank lets you log workouts, earn ELO points and climb ranks. ELO and ranks are a game score. They are not a measure of your health or fitness.</p>

    <h2>Not medical or training advice</h2>
    <p>FitRank does not give medical, health, nutrition or weight-loss advice. Exercise has risks. Talk to a qualified professional if you are unsure what is safe for you, and train at your own risk and your own pace.</p>

    <h2>Your account</h2>
    <ul>
      <li>You sign in with a Google account. You are responsible for what happens under your account.</li>
      <li>Use FitRank for yourself. Don’t try to access other people’s data, break or overload the service, or work around its limits.</li>
      <li>We may suspend an account that does.</li>
    </ul>

    <h2>Your data</h2>
    <p>Your workouts are yours. What is stored and where is described on the <a href={PRIVACY_HREF}>Privacy</a> page. You can export your data or delete your account at any time in Settings.</p>

    <h2>Provided as is</h2>
    <p>FitRank is a personal project provided as is, with no promises. It may have bugs, change, or be unavailable, and data can be lost. Export your data from Settings now and then if it matters to you. To the extent the law allows, FitRank and its author are not liable for losses from using it.</p>

    <h2>Changes and questions</h2>
    <p>If these terms change, this page and its date change. Continuing to use FitRank after a change means you accept it. There is no contact address or form yet; you can export or delete your data yourself at any time in Settings.</p>

    <a className="app-button app-secondary" href={signedIn ? "#/settings" : "#/home"}>{signedIn ? "Back to Settings" : "Back to sign in"}</a>
  </article>;
}
