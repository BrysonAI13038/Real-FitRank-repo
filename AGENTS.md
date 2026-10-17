# FitRank

Agent instructions live in [CLAUDE.md](CLAUDE.md). Read it first; it is the source of truth for the stack, rules and workflow.

## Quick reference

- Package manager: npm (matches Netlify). Run `npm run dev`, `npm run build`, `npm test`.
- Entry: `src/main.tsx` → `src/App.tsx`. Workout code is in `src/workout/`, pages in `src/app/`.
- Storage is browser localStorage; never break saved data (see `src/workout/storage.ts`).
- Roadmap: [docs/ROADMAP.md](docs/ROADMAP.md).
