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
4. **ELO redesign.** Done: ELO is mostly consistency (first session of a day, weekly 3-day target, streak), an effort bonus (+6 per exercise with 3+ sets, max 5 exercises a day; was +3 until step 7 testing), +5 per 20 lb milestone above your all-time best, and user-set weight/reps goals with a fixed reward. Higher ranks earn more slowly (×1.0 down to ×0.5). Thresholds: Silver 300, Gold 900, Platinum 2000, Diamond 4000, Elite 7500. Old workouts keep their stored ELO; data is now v3 (`fitrank.data.v3`, v2 left untouched). No ELO loss for missed workouts. Deferred: bodyweight-relative scoring (see Optional, later) and combined weight+reps goals.
5. **Food logging, or hide the button.** Done: food logging is deferred. The Home button is a disabled "Log Food · Coming soon", the Food nav item is marked "Soon", and the Food page says Coming soon. The unused Figma mock screens (with fake food UI) were removed. **Reminder: build food logging later.** Keep it optional and minor: small bonuses for consistency, protein sources and food variety, never punishing foods. It will need a storage v4 migration and a new capped ELO bonus source.
6. **History and stats, then mobile/PWA.** Done (install, offline and iOS safe areas verified on a real device): history is grouped by month with an exercise filter, paging and the per-session ELO breakdown. Progress has ELO-over-time, weekly consistency and per-exercise charts (hand-rolled SVG) plus personal records, all derived from saved data (`src/workout/stats.ts`, no storage change). FitRank is an installable PWA (`public/manifest.webmanifest`, icons from `design/app-icon.png`) with a basic offline shell (`public/sw.js`: network-first pages, cache-first hashed assets, no update prompt), self-hosted fonts and Netlify cache headers. Mobile polish: safe-area insets, 48px nav targets, 16px inputs, `100dvh`. `muscleSets` in stats.ts is ready for the optional Muscle Map.
7. **Accounts and cloud storage.** In progress on branch `step-7-accounts`; `main` stays sign-in-free until the merge gate below passes. Built: Supabase schema (Postgres + auth, row-level security), merge-based sync (workouts are immutable and unioned by id, stored ELO is never recalculated, goals use soft delete), per-account local storage (`u.<uid>.` key prefix), one-time device import (first account only; original keys are never modified), Settings (sync status, sign out, export my data, delete account, "Import data from this device"), and a static Privacy page at `#/privacy` linked from Settings and the sign-in screen. Sign-in is required. **Delivery: a PWA on Netlify with Google sign-in.** Which methods appear is decided at build time: `VITE_GOOGLE_SIGNIN=on` is the default and must be set in every Netlify context including Production; email one-time-code sign-in is built but off (`VITE_EMAIL_SIGNIN=on` enables it, and it needs custom SMTP on a domain you own); Apple sign-in is not offered. These flags and the Supabase URL and anon key are baked in at build time, so set the Production values before merging. The DB caps `earned` at 635 (scoring max 185 + three goals at 150 each), so update the schema if `SCORING` or `GOAL_RULES` change.

   **Merge gate** (all must pass before `step-7-accounts` merges to `main`):
   - `npm test`, `tsc --noEmit`, `npm run build` and `npm run check:dist` pass on a build with the production flags (only the anon/publishable key in the bundle).
   - On a Branch deploy with the production flags: Google sign-in on desktop, iPhone Safari and the installed home-screen app; your existing data appears under the same account; a second Google account starts empty with no import prompt, cannot see the first account's data, and can export and delete its own; a workout logged offline syncs after reconnecting; sign out and back in works; the Privacy page opens signed out (from the sign-in screen) and from Settings; the email form does not appear.
   - **Publish the Google consent screen ("In production") before real users sign in**, with the Privacy page URL as its privacy policy link, then confirm a Google account that is not on the test-user list can sign in on the production URL.
   - Production env vars set (Supabase URL, anon key, `VITE_GOOGLE_SIGNIN=on`) before the merge deploy; Supabase Site URL and redirect URLs include the production URL.
   - After the merge deploy is green: re-check Google sign-in, the Privacy page and `check:dist` on the production URL. Rollback is publishing the last good Netlify deploy.

Privacy and security are part of step 7: each user's data is private to their account (row-level security), exportable and deletable, and the Privacy page says what is stored and where.

## Optional, later

Not planned unless people use the app:

- **App Store release (only if people use the app).** Capacitor wrapper (ask before adding), iOS icons and splash, TestFlight, submission. Needs the $99/yr Apple Developer Program. Because step 7 signs in with Google, Apple Guideline 4.8 would apply to an iOS app, so settle first whether to add Sign in with Apple (and Apple token revocation on account deletion) or switch to email-code sign-in only (custom SMTP on a domain you own); re-read the current wording of 4.8 and 5.1.1(v) (in-app account deletion, already built). App Review needs a way to sign in, since reviewers can't use your Google account or inbox, so plan a demo account. Also: CAPTCHA (Cloudflare Turnstile) before public promotion if email codes are on, privacy labels (email address linked to the user), a support contact, error monitoring, backups with a restore test, a predeploy `npm test && npm run build` check, an accessibility pass, a wording review (no medical or weight-loss claims), usage/spend alerts, and a check of Supabase free-tier limits (projects pause after inactivity).
- Battles between users (needs server-side ELO validation first, since ELO is computed on the client)
- Muscle Map built from workout data (`muscleSets` in `src/workout/stats.ts` is ready) and muscle-specific ranks
- Achievements
- Bodyweight-relative scoring and combined weight+reps goals
- Food logging (optional and minor, see step 5; needs a storage v4 migration)
