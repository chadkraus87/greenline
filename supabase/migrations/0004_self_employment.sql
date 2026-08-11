-- Self-employment support for budget tracking (applied 2026-08-05).
--
-- Scope note: this is deliberately NOT bookkeeping — no client books, no chart
-- of accounts, no double entry. It adds business tagging, a mileage log, and a
-- Schedule C summary on top of the existing personal budget model.
--
-- Everything is opt-in per user via settings.business_mode, so W-2-only users
-- never see any of it.

alter table public.settings
  add column if not exists business_mode boolean not null default false,
  -- IRS standard mileage rate changes annually; user-editable, never assumed.
  add column if not exists mileage_rate numeric not null default 0.70,
  add column if not exists business_name text;

-- business_pct covers mixed-use costs (a phone that's 60% business), which is
-- where sole proprietors most often over- or under-claim.
alter table public.expenses
  add column if not exists business boolean not null default false,
  add column if not exists business_pct numeric not null default 100
    check (business_pct >= 0 and business_pct <= 100),
  add column if not exists tax_category text;

-- Self-employment / 1099 income, as distinct from W-2 wages.
alter table public.incomes
  add column if not exists business boolean not null default false;

create index if not exists expenses_business_idx on public.expenses (user_id, business, date);

-- Standard-mileage log. Deliberately NOT part of the cash forecast: the IRS
-- standard rate is a tax deduction, not money leaving the account.
create table public.mileage (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  date          date not null,
  miles         numeric not null default 0 check (miles >= 0),
  purpose       text not null,
  from_location text,
  to_location   text,
  created_at    timestamptz not null default now()
);
alter table public.mileage enable row level security;
create index mileage_user_date_idx on public.mileage (user_id, date desc);

-- Owner-only, exactly like the other financial tables. Calendar sharing does
-- NOT reach this — verified by the RLS tests in docs/V2_PLAN.md.
create policy "own rows" on public.mileage
  for all using (user_id = auth.uid() and public.is_approved())
  with check (user_id = auth.uid() and public.is_approved());
