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

## Importing transactions

Expenses tab → **Import / scan statement**. Three sources feed one review screen:

| Source | What happens |
|---|---|
| **CSV file** | Parsed and column-mapped (auto-detected, you confirm) |
| **Statement PDF** | Read by Claude into a transaction list — for banks whose CSV export is poor |
| **Photo of several receipts** | Split into separate expenses, all linked to the source image |

Every row is categorized individually from your own history, shown with an `auto` badge,
and nothing is written until you confirm.

The CSV parser works with any bank: quoted fields, `$1,234.56`, accounting negatives
`(12.34)`, European decimals, and several date formats. It guesses which column is which —
single signed `Amount`, or split `Debit`/`Credit` — and you confirm the mapping.

Whatever the source:

- Money **in** (deposits, refunds) is detected and excluded by default
- Transactions you've already recorded are flagged and unticked
- Repeats within the same file are caught too
- Unreadable rows stay visible with a reason rather than disappearing silently

`docs/sample-bank-export.csv` is a realistic file for trying it out.

## Self-employment (optional)

Off by default. Turn on **Settings → I have self-employment income** and the app adds:

- **Business tagging** on expenses, with a **business-use %** for mixed costs and a
  **Schedule C category** per expense. Meals are correctly treated as 50% deductible.
- **Mileage log** — date, miles, and business purpose per trip (what the IRS actually
  asks for), valued at a user-editable standard rate, exportable as CSV.
- **Tax tab** — income, deductions grouped by Schedule C line, net profit, an SE-tax
  set-aside estimate, and quarterly due dates. Plus a **readiness check** (uncategorized
  spend, expenses over $75 with no receipt, income never marked received), a **prior-year
  comparison** that flags deductions claimed last year but not this one, and a **ZIP export
  package** for a preparer: summary, itemized expenses, income, mileage, and every receipt
  image named `YYYY-MM-DD_merchant_amount`.
- Bulk business tagging when importing a business card statement.
- **Retention review** in Settings — receipts grouped by year, business vs. personal.
  Only personal receipts from past years can be cleared in bulk; business receipts back
  a filed return, so bulk deletion is deliberately not offered.

Greenline is a budget tracker, **not** bookkeeping software: no client books, no chart of
accounts, no double entry. Tax figures are planning estimates, not advice or a filed return.

## Receipts

Every scanned receipt is filed in a searchable **Receipts** tab — filter by year,
business/personal, or free text (merchant, amount, notes), then view the original image.
Images stay private; each view mints a short-lived signed URL.

## Calendar sharing

Share **calendar events** with another account: invite by email, pick view-only or
view & edit, and they must accept. Financial data is never included. Manage it from the
share icon in the header; either side can end a share at any time.

## Budgeting features

Cash-runway forecast · buffer floor · sinking funds for irregular bills · debt payoff
(snowball vs. avalanche) · savings rate & net worth · emergency-fund target · category
budgets with rollover (envelope) and burn-rate pacing · 50/30/20 guide · tax set-aside on
untaxed income · subscription/recurring audit · CSV export · encrypted backups.

## Updates

Greenline is a PWA, so the service worker serves it from cache — which means an
open tab will happily keep running an old build. It checks for a new one hourly
and whenever you return to the tab, then offers **Reload** rather than pulling
the page out from under a half-typed expense.

The worker activates as soon as it installs (`skipWaiting`). Letting it wait is
the usual advice, but it strands anyone whose page predates the banner: nothing
on that page can activate the waiting worker, so reloading never recovers it —
only closing every tab does. Activating immediately means a stale client is
always one reload from healthy, and the banner is what prevents the silent-stale
problem instead.

The worker is registered with plain browser APIs, not `registerSW()` from
`virtual:pwa-register` — that helper keeps state we can't see and installs its
own `controlling -> location.reload()` listener, which reloads the page unasked.

## Deployment

Vercel, auto-deploying from `master`. Two environment variables are required:
`VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
