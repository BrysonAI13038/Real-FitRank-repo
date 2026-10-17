# FitRank Roadmap

## Current

- Working FitRank app structure
- Workout logging
- ELO and ranks
- Workout history and saved local progress
- Instrument Panel atmosphere/design

## Next

1. **Housekeeping.** Done: npm is the package manager (matches Netlify), `pnpm-lock.yaml` removed, `netlify.toml` and `npm test` added, `AGENTS.md` replaced.
2. **Data model v2.** Done: versioned save under a new key (v1 left untouched as a backup), a tolerant `loadData` that quarantines bad entries instead of failing, and a v1 → v2 migration.
3. **Exercise library and workout logger.** Done: 66-exercise searchable library with primary/secondary muscle tags (`src/workout/exercises.ts`), a multi-exercise logger (max 7 per session) with per-set weight and reps, and an autosaved draft (`fitrank.draft.v1`, separate from saved data).
4. **ELO redesign.** Done: ELO is mostly consistency (first session of a day, weekly 3-day target, streak), an effort bonus (+3 per exercise with 3+ sets, max 5 exercises a day), +5 per 20 lb milestone above your all-time best, and user-set weight/reps goals with a fixed reward. Higher ranks earn more slowly (×1.0 down to ×0.5). Thresholds: Silver 300, Gold 900, Platinum 2000, Diamond 4000, Elite 7500. Old workouts keep their stored ELO; data is now v3 (`fitrank.data.v3`, v2 left untouched). No ELO loss for missed workouts. Deferred: bodyweight-relative scoring (step 8) and combined weight+reps goals.
5. **Food logging, or hide the button.** Done: food logging is deferred. The Home button is a disabled "Log Food · Coming soon", the Food nav item is marked "Soon", and the Food page says Coming soon. The unused Figma mock screens (with fake food UI) were removed. **Reminder: build food logging later.** Keep it optional and minor: small bonuses for consistency, protein sources and food variety, never punishing foods. It will need a storage v4 migration and a new capped ELO bonus source.
6. **History and stats, then mobile/PWA.** Richer workout history and progress stats, then make FitRank installable as a PWA and finish mobile polish.
7. **Accounts and cloud storage.** Google Sign-In and secure cloud storage so each user's progress is tied to their account.
8. **Battles, Muscle Map, achievements.** Battles between users, the Muscle Map built from workout data and muscle-specific ranks, and achievements.

Privacy and security will be considered when accounts are added, including keeping each user's data private and providing control over their stored data.
