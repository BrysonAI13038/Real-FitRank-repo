# FitRank Roadmap

## Current

- Working FitRank app structure
- Workout logging
- ELO and ranks
- Workout history and saved local progress
- Instrument Panel atmosphere/design

## Next

1. **Housekeeping.** Mostly done: npm is the package manager (matches Netlify), `pnpm-lock.yaml` removed, `netlify.toml` added, `npm test` script added. Remaining: replace the stale Figma Make `AGENTS.md`.
2. **Data model v2.** Versioned save under a new key (v1 left untouched as a backup), a tolerant `loadData` that quarantines bad entries instead of failing, and a v1 → v2 migration.
3. **Exercise library and workout logger.** A larger searchable exercise library with muscle-group tags, and a multi-exercise logger with per-set weight and reps.
4. **ELO redesign.** Only when explicitly requested. No ELO loss for missed workouts.
5. **Food logging, or hide the button.** If built: optional, minor, small bonuses for consistency, protein sources and food variety, never punishing foods. Otherwise remove or label the entry point "Coming soon".
6. **History and stats, then mobile/PWA.** Richer workout history and progress stats, then make FitRank installable as a PWA and finish mobile polish.
7. **Accounts and cloud storage.** Google Sign-In and secure cloud storage so each user's progress is tied to their account.
8. **Battles, Muscle Map, achievements.** Battles between users, the Muscle Map built from workout data and muscle-specific ranks, and achievements.

Privacy and security will be considered when accounts are added, including keeping each user's data private and providing control over their stored data.
