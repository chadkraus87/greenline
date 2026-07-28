# Greenline v2 — Multi-user, Supabase-backed

Status: **design approved, build paused pending Supabase Pro upgrade** (2026-07-28).
When you resume: tell me the org is on Pro, I create the `greenline` project, apply
`supabase/migrations/0001_init.sql`, wire the frontend, and we QA + security-validate end to end.

---

## 1. What changes and why

v1 was "privacy-first, nothing leaves the device" — all data in the browser (IndexedDB).
Your new requirements — **registered users, admin approval, per-user private data, two
separate accounts** — cannot be enforced in a browser-only app (anyone can open dev tools
and read/modify local data). So v2 becomes a **client–server web app**:

- **Frontend:** the existing React app, deployed to a URL (still installable as a PWA).
- **Backend:** Supabase (managed Postgres + Auth + Row-Level Security).
- **You (Chad):** the Admin. New users self-register, land in a `pending` state, and can
  see nothing until you approve them. Each approved user gets a private, isolated dataset.

Decisions locked in (2026-07-28):
- Architecture: **Web app + Supabase** (managed cloud).
- Sign-in: **email + password + admin approval**.
- Scale: **2 users initially**. Confirmed a small DB is correct — user tables will have
  single-digit rows. No need to over-provision.

## 2. Data model (see `supabase/migrations/0001_init.sql`)

One `profiles` row per auth user, plus per-user copies of the v1 tables. Every data table
carries `user_id` and is protected by RLS so `user_id = auth.uid()`.

| Table        | Purpose                            | Notes |
|--------------|------------------------------------|-------|
| `profiles`   | role + approval status per user    | role: `admin`\|`user`; status: `pending`\|`approved`\|`rejected` |
| `settings`   | theme, clock24, start_balance      | one row per user (PK = user_id) |
| `categories` | budget categories                  | now **user-editable** (add/rename/recolor/limit) |
| `incomes`    | income sources + received map      | `received` jsonb |
| `bills`      | recurring bills + paid map         | `paid` jsonb |
| `expenses`   | one-off expenses                   | indexed on (user_id, date) |
| `goals`      | savings goals                      | |
| `events`     | calendar events                    | |

`jsonb` maps (`received`, `paid`) carry over v1's shape unchanged, so `lib/forecast.ts`
and the whole compute layer are **reused as-is** — only the data source changes.

## 3. Security model (Row-Level Security)

- RLS **enabled on every table**. Base policy: a row is visible/editable only when
  `user_id = auth.uid()` **and** the caller's profile is `approved`.
- `profiles`: a user may read/update only their own row; the **admin** may read all and
  update `status` (to approve/reject). Enforced by a `SECURITY DEFINER` `is_admin()` helper.
- A pending or rejected user's queries return **zero rows** — the gate is in the database,
  not just the UI, so it cannot be bypassed from the browser.
- New-user provisioning: a trigger creates the `profiles` row on signup (`pending`). On
  approval, a function seeds that user's 8 default categories + default settings.
- The frontend uses only the **publishable/anon key** (safe to ship). No service-role key
  in the browser, ever.

## 4. Frontend work (to build once the project exists)

1. `src/lib/supabase.ts` — client from `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.
2. `src/auth/` — AuthProvider (session), Login/Signup screen, Pending screen, sign-out.
3. Replace `src/db/` (Dexie) with a Supabase data layer exposing the same `AppData` shape:
   - `loadAll()` → one fetch per table, assembled into `AppData` (unchanged downstream).
   - mutations mirror v1 `actions.ts` (saveBill, toggleBillPaid, …) as Supabase calls.
   - Reactivity: a `DataProvider` holds `AppData` and refetches after each mutation
     (small data, 2 users → realtime subscriptions optional, not required).
4. `src/features/admin/` — Admin panel: list pending/approved users, approve/reject.
   Visible only to the admin profile.
5. Keep encrypted/plain **backup export**; **import** now writes to the user's own rows.

## 5. Other improvements bundled into v2 (from the 2026-07-28 review)

- **Fonts:** drop the Google Fonts `@import` (an external request + privacy/latency cost).
  Replace with **Fontsource** self-hosting — `npm i @fontsource-variable/fraunces
  @fontsource/instrument-sans @fontsource/spline-sans-mono`, import in `main.tsx`. Fonts get
  bundled locally: zero third-party requests, no layout shift, offline-safe. (Alternative if
  you'd rather ship nothing extra: a pure system-font stack — but that loses the Fraunces
  display look you have now. Recommendation: Fontsource.)
- **Error boundary:** top-level React error boundary so a stray error never white-screens.
- **CSV export:** expenses (and a monthly summary) to CSV for taxes / sharing.
- **User-editable categories:** add / rename / recolor / delete, per user.
- **CSP + security headers:** update CSP `connect-src` to allow `https://*.supabase.co`;
  add real HTTP headers at the host (`X-Frame-Options: DENY`, `Strict-Transport-Security`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`). A `vercel.json`/`_headers` file.
- **CI:** GitHub Actions running typecheck + unit tests + build on every push.
- **Dev-dependency audit:** revisit the `vite-plugin-pwa`→`workbox-build` advisories
  (dev-only, not shipped) and bump when a clean release is available.

## 6. Resumption checklist

- [ ] Chad upgrades Kraus Haus org to Supabase Pro, tells me.
- [ ] I create the `greenline` project (us-east-2) and apply `0001_init.sql`.
- [ ] I run `get_advisors` (security) — expect zero RLS gaps.
- [ ] Add `.env` with the project URL + anon key (from `.env.example`).
- [ ] Build auth + data layer + admin panel + the section-5 improvements.
- [ ] Promote Chad's account to `admin` + `approved` (one SQL update).
- [ ] Full QA (unit + e2e against a live test project) and security validation.
- [ ] Deploy frontend (Vercel/Netlify) + headers; hand off admin instructions.
