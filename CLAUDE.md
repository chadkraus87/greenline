# CLAUDE.md — Greenline

## What this project is
A private monthly budget built around one question: what is genuinely left to
spend? Projects a daily cash runway from scheduled bills and income, then scores
the month's health as spending happens against it.

- Repo: github.com/chadkraus87/greenline (**public** — see Security below)
- Live: https://greenline-chadwick-kraus-projects.vercel.app/

## Architecture
- React + TypeScript on Vite, installable/offline-capable PWA (vite-plugin-pwa
  + Workbox). Recharts for trends, Zod for validation.
- `src/features/` — feature-first (bills, income, expenses, budgets, goals,
  reserves, debt, reports). New work usually lands here.
- `src/auth/` — Supabase auth flows. `src/db/` and `src/data/` — data access.
- `src/components/` — shared presentational pieces only.
- `src/Root.tsx` / `src/App.tsx` — shell and routing.
- `supabase/migrations/` — versioned schema across 12 tables. **Never edit an
  applied migration; add a new one.**
- `supabase/functions/` — Deno edge function(s).

## Non-negotiable rules
1. **RLS is the security boundary.** Every table is scoped per account by
   row-level security. Enforce access in policies, not in the UI.
2. **Money math must not use floats for storage.** Rounding drift is the fastest
   way to make a budget app untrustworthy. Keep the existing representation and
   conversion helpers; don't introduce ad-hoc `parseFloat` arithmetic.
3. **The cash runway is the product.** It projects forward from *scheduled*
   flows. Any change to bills/income scheduling must keep the projection and the
   calendar in agreement — they read the same source, keep it that way.
4. **Never commit real Supabase values.** `.env.example` holds placeholders;
   `.env` and `.env.*` are gitignored (with `!.env.example`). The anon key is
   public by design; the service-role key belongs only in Supabase/Vercel/GitHub
   secrets. The backup script reads it from the environment — keep it that way.
5. **Security headers are deliberate.** The deployment ships a real CSP with
   HSTS and frame-deny (`vercel.json` / `public/_headers`). If you add a
   third-party script or embed, update the CSP rather than loosening it.

## Commands
```
npm run dev
npm run typecheck    # run before committing
npm run test         # Vitest
npm run test:e2e     # Playwright (e2e/)
npm run backup       # needs SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, BACKUP_PASSPHRASE in env
npm run restore
```

## Security (repo is public)
Keep this file and the README operationally quiet: no keys, no project refs
paired with credentials, no notes about unfixed weaknesses. Explaining the
security *design* is fine and is part of why the repo is public.
