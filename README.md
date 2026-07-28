# Greenline — Monthly Budget Tracker

Privacy-first, offline-capable monthly budgeting. **All data lives in your browser's IndexedDB — no server, no accounts, no analytics, nothing leaves the device.**

## Stack

React 18 · TypeScript (strict) · Vite 6 · Dexie (IndexedDB) · Zod · Recharts · vite-plugin-pwa · Vitest · Playwright

## Quick start

```bash
npm install
npm run dev        # dev server
npm run build      # typecheck + production build (dist/) with service worker
npm run preview    # serve the production build
npm test           # 24 unit/integration tests (Vitest + fake-indexeddb)
npm run test:e2e   # Playwright smoke tests (requires `npx playwright install` once)
```

## Architecture

```
src/
  types.ts            Domain models (Bill, IncomeSource, Expense, Goal, …)
  lib/                Pure logic — no React, fully unit-tested
    occurrences.ts      Income schedule engine (monthly/biweekly/weekly/quarterly/annual/once)
    forecast.ts         computeMonth(): occurrences, totals, daily cash forecast, health score
    schema.ts           Zod schemas — every import is validated against these
    backup.ts           AES-256-GCM encrypted backups (WebCrypto, PBKDF2 210k iterations)
  db/
    db.ts               Dexie schema (v1; versioned migrations go here)
    repo.ts             Seeding, settings, atomic export/import/reset
    actions.ts          All mutations; deletes return undo closures
  hooks/              useNow (live clock), useToasts
  components/         Shared UI + the cash-runway ribbon
  features/           calendar, bills, income, expenses, budgets, goals, reports, backup
```

Data flow: Dexie `useLiveQuery` streams tables into `App`, `computeMonth()` derives the month model (forecast, health, per-category spend), features render it and write back through `db/actions`. No global state library needed — IndexedDB is the source of truth and live queries keep the UI in sync.

## Security & privacy

- CSP meta policy (no inline scripts, self-only connect)
- Strict TypeScript; Zod validation on every import path — invalid files are rejected atomically, existing data untouched
- Input length caps + angle-bracket stripping on free-text fields; React escaping everywhere
- Encrypted backups: AES-256-GCM, key derived with PBKDF2-SHA256 (210,000 iterations); wrong passphrase fails closed
- No third-party requests except Google Fonts (cached by the service worker; self-host to go fully airgapped)

## PWA

`vite-plugin-pwa` generates a service worker (precache + font runtime cache) and manifest. Installable, works offline after first load.

## Future expansion

The repo/actions split means cloud sync, household sharing, or a Claude-powered assistant slot in behind `db/actions` without touching features. Dexie schema versioning handles data migrations.

## Known deviations from the original brief

- Plain CSS design tokens instead of Tailwind (zero-dependency styling; trivial to swap)
- Controlled forms + Zod instead of React Hook Form (forms are small; RHF adds weight without benefit here)
- date-fns not needed — the app's date math is ~10 tested helpers
- Week/agenda calendar views, drag-and-drop, and CSV export are not yet built
