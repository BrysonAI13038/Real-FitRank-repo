# FitRank

Gamified workout tracker: users log workouts, earn ELO, climb ranks
(Bronze → Silver → Gold → Platinum → Diamond → Elite).
Full project context: docs/ROADMAP.md (read only when needed).

## Stack
- React 19 + Vite 8 + TypeScript + Tailwind CSS v4 (originally exported from Figma Make)
- Package manager: pnpm (see .mise.toml). Don't use npm.
- Start: src/main.tsx → src/App.tsx. Global CSS in src/index.css.
- Storage: browser localStorage (no backend yet). Hosted on Netlify.
- The dev server is NOT running automatically. Start it with `pnpm dev`.

## Rules
- Never break existing saved localStorage data. Changing the data shape requires a migration.
- Don't change ELO math or rank thresholds unless I explicitly ask.
- No ELO loss for missed workouts. Food logging stays optional and minor.
- No unfinished buttons: build it or label it "Coming soon".
- Keep it simple. No new libraries without asking.
- Run tests and the build after changes and report the results.

## How I work
- Process: Understand → Predict → Test → Verify → Continue.
- Short, direct answers. Push back on weak ideas.
- For big changes, propose a plan before editing.
- Tell me when a change is a good commit point and suggest a message.

## Current priority
Phase 1: multi-exercise workout sessions with per-set weight and reps,
saved in a way that ELO can use later.