# Workout Tracker

Offline-first workout tracker built with React, TypeScript, and Vite. It is designed for one-handed phone use with fast set logging and simple progressive overload guidance.

## Run

```bash
npm install
npm run dev
```

## Scripts

- `npm run dev` - local development server.
- `npm run build` - production build.
- `npm run preview` - preview production build.
- `npm run test` - unit and integration tests with Vitest.
- `npm run lint` - ESLint checks.
- `npm run typecheck` - TypeScript project checks.

## Architecture Notes

- UI: React + React Router in `src/screens`.
- Storage: IndexedDB via Dexie in `src/lib/db.ts`.
- PWA shell caching: `public/sw.js` + `public/manifest.webmanifest`.
- App preferences (default unit/rest timer): localStorage in `src/lib/preferences.ts`.
- Export/import:
  - JSON: full database + preferences.
  - CSV: flattened sessions + set entries.

### Progression Metric

History uses **estimated 1RM** (`weight * (1 + reps / 30)`) from the best work set in each session.

### Double Progression Rule

For each exercise:

- If all target work sets hit `repMax` at the same weight, suggest increasing weight by `weightIncrement` and reset reps near `repMin`.
- Otherwise suggest keeping weight and adding `+1` rep to the lowest-rep work set(s).
- Suggestions never block logging and can always be ignored.
