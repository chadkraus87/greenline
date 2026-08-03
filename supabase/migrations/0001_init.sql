-- Greenline v2 — initial schema: auth profiles, admin approval, per-user data + RLS.
-- Reviewable draft (2026-07-28). Applied once the Supabase project exists.
-- Design notes: docs/V2_PLAN.md

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role       as enum ('admin', 'user');
create type public.approval_status as enum ('pending', 'approved', 'rejected');

-- ---------------------------------------------------------------------------
-- Profiles: one row per auth user; carries role + approval status.
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  role        public.user_role       not null default 'user',
  status      public.approval_status not null default 'pending',
  created_at  timestamptz            not null default now(),
  approved_at timestamptz
);
alter table public.profiles enable row level security;

-- Security-definer helpers bypass RLS on profiles (avoids policy recursion).
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'approved'
  );
$$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'approved'
  );
$$;

-- A user reads only their own profile; the admin reads all.
create policy "profiles: read own or admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- Only the admin may change a profile (approve/reject/role). Users cannot
-- self-escalate: they have no update policy at all.
create policy "profiles: admin updates" on public.profiles
  for update using (public.is_admin()) with check (public.is_admin());

-- On signup, create the profile in 'pending' (runs as definer, bypasses RLS).
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Per-user data tables. Every row is owned by user_id (defaults to auth.uid()).
-- ---------------------------------------------------------------------------
create table public.settings (
  user_id          uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  theme            text    not null default 'dark' check (theme in ('dark', 'light')),
  clock24          boolean not null default false,
  start_balance    numeric not null default 0,
  buffer_floor     numeric not null default 0,
  extra_debt_budget numeric not null default 0,
  emergency_months int     not null default 3,
  rollover_budgets boolean not null default false
);

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name          text not null,
  color         text not null default '#8FA396',
  monthly_limit numeric not null default 0,   -- maps to app field `limit`
  sort_order    int  not null default 0,
  created_at    timestamptz not null default now()
);

create table public.incomes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,
  amount      numeric not null default 0,
  frequency   text not null check (frequency in ('monthly','biweekly','weekly','quarterly','annual','once')),
  anchor_date date not null,
  received    jsonb not null default '{}'::jsonb,
  tax_rate    numeric not null default 0 check (tax_rate between 0 and 100),
  created_at  timestamptz not null default now()
);

create table public.bills (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,
  amount      numeric not null default 0,
  category_id uuid references public.categories (id) on delete set null,
  due_day     int  not null check (due_day between 1 and 31),
  priority    text not null default 'normal' check (priority in ('high','normal','low')),
  notes       text,
  paused      boolean not null default false,
  paid        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title       text not null,
  amount      numeric not null default 0,
  category_id uuid references public.categories (id) on delete set null,
  date        date not null,
  merchant    text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index expenses_user_date_idx on public.expenses (user_id, date);

create table public.goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name       text not null,
  target     numeric not null default 0,
  saved      numeric not null default 0,
  monthly    numeric not null default 0,
  color      text not null default '#8FA396',
  created_at timestamptz not null default now()
);

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  title      text not null,
  date       date not null,
  notes      text,
  color      text not null default '#8FA396',
  created_at timestamptz not null default now()
);

create table public.sinking_funds (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name           text not null,
  total          numeric not null default 0,
  cadence_months int  not null default 12 check (cadence_months between 1 and 120),
  due_date       date not null,
  saved          numeric not null default 0,
  category_id    uuid references public.categories (id) on delete set null,
  color          text not null default '#8FA396',
  created_at     timestamptz not null default now()
);

create table public.debts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name        text not null,
  balance     numeric not null default 0,
  apr         numeric not null default 0 check (apr between 0 and 100),
  min_payment numeric not null default 0,
  color       text not null default '#8FA396',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RLS: a row is visible/editable only by its approved owner.
-- The DB is the gate — a pending/rejected user's queries return zero rows.
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['settings','categories','incomes','bills','expenses','goals','events','sinking_funds','debts']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($p$
      create policy "own rows" on public.%I for all
        using (user_id = auth.uid() and public.is_approved())
        with check (user_id = auth.uid() and public.is_approved());
    $p$, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Provision defaults the first time a user is approved.
-- ---------------------------------------------------------------------------
create or replace function public.seed_user_defaults(uid uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.categories where user_id = uid) then
    return;  -- already seeded
  end if;
  insert into public.categories (user_id, name, color, monthly_limit, sort_order) values
    (uid, 'Housing',        '#46B380', 0, 0),
    (uid, 'Utilities',      '#5FA8D3', 0, 1),
    (uid, 'Food & Dining',  '#D9A441', 0, 2),
    (uid, 'Transportation', '#7A8FE0', 0, 3),
    (uid, 'Healthcare',     '#C77DBA', 0, 4),
    (uid, 'Entertainment',  '#E0784C', 0, 5),
    (uid, 'Debt',           '#C4595E', 0, 6),
    (uid, 'Miscellaneous',  '#8FA396', 0, 7);
  insert into public.settings (user_id) values (uid) on conflict (user_id) do nothing;
end;
$$;

create or replace function public.on_profile_approved()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'approved' and (old.status is distinct from 'approved') then
    perform public.seed_user_defaults(new.id);
    new.approved_at := now();
  end if;
  return new;
end;
$$;
create trigger profile_approved
  before update on public.profiles
  for each row execute function public.on_profile_approved();

-- ---------------------------------------------------------------------------
-- Admin bootstrap (run once, after Chad has signed up through the app):
--   update public.profiles set role = 'admin', status = 'approved'
--   where email = 'chadkraus87@gmail.com';
-- ---------------------------------------------------------------------------
