# Greenline — Monthly Budget Tracker

A private, multi-user monthly budgeting app. Every account's data is isolated at the
database level, and **new accounts can't see anything until an admin approves them.**

## Stack

React 18 · TypeScript (strict) · Vite 6 · Supabase (Postgres + Auth + RLS) · Zod · Recharts
· vite-plugin-pwa · Vitest · Playwright · Fontsource (self-hosted fonts)

## Quick start

```bash
npm install
cp .env.example .env   # fill in your Supabase URL + publishable (anon) key
npm run dev            # dev server
npm run build          # typecheck + production build
npm test               # unit/integration tests (Vitest)
npm run test:e2e       # Playwright (public tests; see "Testing" below)
```

## Architecture

```
src/
  types.ts            Domain models (Bill, IncomeSource, Expense, Goal, SinkingFund, Debt, …)
  lib/                Pure logic — no React, fully unit-tested
    occurrences.ts      Income schedule engine (monthly/biweekly/weekly/quarterly/annual/once)
    forecast.ts         computeMonth(): occurrences, totals, daily cash forecast, health score
    debt.ts             Snowball vs. avalanche payoff simulation
    insights.ts         History, variance, emergency fund, net worth, burn pace, rollover
    csv.ts              CSV export (formula-injection safe)
    backup.ts           AES-256-GCM encrypted backups (WebCrypto, PBKDF2 210k)
    schema.ts           Zod schemas — every import is validated against these
    supabase.ts         Supabase client
  auth/               AuthProvider, sign-in/up, pending-approval, password reset
  db/                 repo (load/export/import), actions (all mutations), mappers (row ⇄ model)
  features/           calendar, bills, income, expenses, budgets, goals, reserves, debt,
                      reports, backup, admin
scripts/              backup.mjs / restore.mjs (encrypted off-site backups)
supabase/migrations/  Schema, RLS policies, triggers
```

Data flow: `repo.loadAll()` pulls the signed-in user's rows into one `AppData` object,
`computeMonth()` derives the month model, features render it and write back through
`db/actions`, and every mutation emits a change that refetches.

## Security model

- **Row-Level Security on every table** — a row is readable/writable only by its *approved*
  owner. The gate is in the database, so it can't be bypassed from the browser.
- **Calendar sharing is the one deliberate exception, and it covers events only.**
  Bills, income, expenses, goals, sinking funds, and debts are never shared —
  their policies are owner-only, full stop. A share requires the owner to invite
  and the recipient to accept; the owner alone sets read vs. read/write, enforced
  by a trigger so a recipient can't promote themselves.
- **Receipts** are stored in a private bucket under `<user_id>/…`, with every storage
  policy checking that prefix against `auth.uid()`. The Anthropic key lives only in the
  `scan-receipt` Edge Function, never in the browser, and scans are throttled per user
  by a table the client cannot read, write, or clear.
- **Admin approval**: signing up creates a `pending` profile that can see nothing. An admin
  approves it, which triggers server-side seeding of that user's default categories.
- Users have no update policy on their own profile, so no self-escalation to admin.
- `SECURITY DEFINER` helpers have `EXECUTE` revoked from `anon`/`authenticated` except the
  two RLS helpers, which only ever reveal the caller's own status.
- Only the publishable (anon) key ships to the browser. **Never** the service-role key.
- CSP + HTTP security headers (`vercel.json` / `public/_headers`): frame-deny, HSTS,
  nosniff, no-referrer, restrictive permissions policy.
- Zod validation on every import path; CSV export neutralizes spreadsheet formula injection.

## Testing

```bash
npm test          # unit + integration
npm run test:e2e  # Playwright
```

E2E is split into three tiers so CI needs no secrets and any clone stays green:

| Tier | Runs when | Covers |
|---|---|---|
| **public** | always | sign-in surface, mode switching, client-side validation |
| **live backend** | `E2E_LIVE_BACKEND=1` | real Supabase rejects bad credentials |
| **authenticated** | `E2E_EMAIL` + `E2E_PASSWORD` | dashboard, every tab, bill CRUD, sign-out |

```bash
# everything, against your real project + a throwaway test account
E2E_LIVE_BACKEND=1 E2E_EMAIL=test@example.com E2E_PASSWORD=… npm run test:e2e
```

CI builds with placeholder Supabase config, so only the public tier runs there — no
credentials ever live in the repo.

## Backups

Supabase Pro takes daily backups. `scripts/backup.mjs` adds an independent copy **you**
hold, encrypted with AES-256-GCM so no one else can read it:

```bash
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… BACKUP_PASSPHRASE=… npm run backup
BACKUP_PASSPHRASE=… npm run restore backups/greenline-YYYY-MM-DD.json.enc
```

`.github/workflows/backup.yml` runs this daily and stores the encrypted artifact for 90
days. It needs three repository secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`BACKUP_PASSPHRASE`. **Lose the passphrase and the backup is unrecoverable — that's the point.**

## Receipt scanning

Snap a receipt → it uploads to private storage → the `scan-receipt` Edge Function asks
Claude to extract merchant, date, total, tax, and a category → the expense form opens
**pre-filled for you to confirm**. Nothing is ever saved automatically; OCR misreads
totals often enough that silent entry would quietly corrupt the ledger.

Requires one secret on the Supabase project (Dashboard → Edge Functions → Secrets):

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

Roughly 1–2¢ per receipt. Capped at 40 scans/user/hour.

## Calendar sharing

Share **calendar events** with another account: invite by email, pick view-only or
view & edit, and they must accept. Financial data is never included. Manage it from the
share icon in the header; either side can end a share at any time.

## Budgeting features

Cash-runway forecast · buffer floor · sinking funds for irregular bills · debt payoff
(snowball vs. avalanche) · savings rate & net worth · emergency-fund target · category
budgets with rollover (envelope) and burn-rate pacing · 50/30/20 guide · tax set-aside on
untaxed income · subscription/recurring audit · CSV export · encrypted backups.

## Deployment

Vercel, auto-deploying from `master`. Two environment variables are required:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
