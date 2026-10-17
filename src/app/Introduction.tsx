import { RANKS } from "../workout/scoring";

export default function Introduction({ onComplete, reviewing = false }: { onComplete: () => void; reviewing?: boolean }) {
  return <section className="app-card app-introduction" aria-labelledby="introduction-title">
    <p className="app-label">Your work. Your progress.</p>
    <h1 id="introduction-title">Welcome to FitRank.</h1>
    <p>Log your workouts and track your progress over time.</p>
    <p>Training consistently, lifting heavier and hitting your goals earns ELO — your progress score. More ELO moves you through the ranks.</p>
    <ol className="app-introduction-ranks" aria-label="FitRank ranks in order">{RANKS.map((rank, index) => <li key={rank.name}>{index > 0 && <span aria-hidden="true">→ </span>}{rank.name}</li>)}</ol>
    <p><strong>ELO never decreases.</strong> The goal is personal progress and consistency, at your own pace.</p>
    <button type="button" className="app-button" onClick={onComplete}>{reviewing ? "Back to Settings" : "Start FitRank"}</button>
  </section>;
}
