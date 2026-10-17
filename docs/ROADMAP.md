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
4. **ELO redesign.** Done: ELO is mostly consistency (first session of a day, weekly 3-day target, streak), an effort bonus (+3 per exercise with 3+ sets, max 5 exercises a day), +5 per 20 lb milestone above your all-time best, and user-set weight/reps goals with a fixed reward. Higher ranks earn more slowly (×1.0 down to ×0.5). Thresholds: Silver 300, Gold 900, Platinum 2000, Diamond 4000, Elite 7500. Old workouts keep their stored ELO; data is now v3 (`fitrank.data.v3`, v2 left untouched). No ELO loss for missed workouts. Deferred: bodyweight-relative scoring (see Optional, later) and combined weight+reps goals.
5. **Food logging, or hide the button.** Done: food logging is deferred. The Home button is a disabled "Log Food · Coming soon", the Food nav item is marked "Soon", and the Food page says Coming soon. The unused Figma mock screens (with fake food UI) were removed. **Reminder: build food logging later.** Keep it optional and minor: small bonuses for consistency, protein sources and food variety, never punishing foods. It will need a storage v4 migration and a new capped ELO bonus source.
6. **History and stats, then mobile/PWA.** Done (install, offline and iOS safe areas verified on a real device): history is grouped by month with an exercise filter, paging and the per-session ELO breakdown. Progress has ELO-over-time, weekly consistency and per-exercise charts (hand-rolled SVG) plus personal records, all derived from saved data (`src/workout/stats.ts`, no storage change). FitRank is an installable PWA (`public/manifest.webmanifest`, icons from `design/app-icon.png`) with a basic offline shell (`public/sw.js`: network-first pages, cache-first hashed assets, no update prompt), self-hosted fonts and Netlify cache headers. Mobile polish: safe-area insets, 48px nav targets, 16px inputs, `100dvh`. `muscleSets` in stats.ts is ready for the optional Muscle Map.
7. **Accounts and cloud storage.** In progress on branch `step-7-accounts`; `main` stays sign-in-free until it is tested. Supabase (Postgres + auth, row-level security), sign-in required. Google Sign-In now; the Apple button stays hidden until the Apple provider works (needs the $99 Apple Developer Program, which step 8 requires anyway). Per-account local storage (`u.<uid>.` key prefix) with a merge-based sync: workouts are immutable and unioned by id, stored ELO is never recalculated, goals use soft delete. Existing on-device data is offered for import once per device (first account only), and original keys are never modified. Settings gets sign out, export my data, delete account and "Import data from this device". The DB caps `earned` at 620 (scoring max 170 + three goals at 150 each), so update the schema if `SCORING` or `GOAL_RULES` change. Merge gate: sign out, export and delete account must all be built and tested first.
8. **App Store release.** Capacitor wrapper (ask before adding), native Google/Apple sign-in, iOS icons and splash, TestFlight, submission. Also: Apple token revocation on account deletion (verify current guideline), recheck Guidelines 4.8 and 5.1.1(v), privacy policy and App Store privacy labels, support contact, error monitoring, backups with a restore test, predeploy `npm test && npm run build` check, accessibility pass, wording review (no medical or weight-loss claims), usage/spend alerts, and a check of Supabase free-tier limits (projects pause after inactivity).

Privacy and security are part of step 7: each user's data is private to their account (row-level security), exportable, and deletable.

## Optional, later

Not planned until FitRank is on the App Store:

- Battles between users (needs server-side ELO validation first, since ELO is computed on the client)
- Muscle Map built from workout data (`muscleSets` in `src/workout/stats.ts` is ready) and muscle-specific ranks
- Achievements
- Bodyweight-relative scoring and combined weight+reps goals
- Food logging (optional and minor, see step 5; needs a storage v4 migration)
