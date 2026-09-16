-- Read-only bank sync (SimpleFIN Bridge) and an expense audit trail.

-- ---------------------------------------------------------------------------
-- Bank connections
--
-- Clients can SEE their own connections but never create, change or read the
-- credential behind one: every write goes through the bank-sync Edge Function,
-- which checks the caller and holds the encryption key.
-- ---------------------------------------------------------------------------
create table public.bank_connections (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  provider        text not null default 'simplefin' check (provider in ('simplefin')),
  status          text not null default 'active' check (status in ('active', 'error')),
  last_synced_at  timestamptz,
  last_error      text,
  created_at      timestamptz not null default now()
);
alter table public.bank_connections enable row level security;
create policy "read own connections" on public.bank_connections
  for select using (user_id = auth.uid() and public.is_approved());

-- The access URL is a bearer credential for someone's bank data. Encrypted with
-- a key that exists only in the Edge Function's environment, and in a table with
-- RLS on and NO policies — unreadable and unwritable from any client.
create table public.bank_credentials (
  connection_id uuid primary key references public.bank_connections (id) on delete cascade,
  ciphertext    text not null
);
alter table public.bank_credentials enable row level security;

create table public.bank_accounts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  connection_id       uuid not null references public.bank_connections (id) on delete cascade,
  external_id         text not null,
  name                text not null,
  org_name            text,
  currency            text not null default 'USD',
  balance             numeric,
  available_balance   numeric,
  balance_date        timestamptz,
  created_at          timestamptz not null default now(),
  unique (connection_id, external_id)
);
alter table public.bank_accounts enable row level security;
create policy "read own bank accounts" on public.bank_accounts
  for select using (user_id = auth.uid() and public.is_approved());

-- Transactions land here for review; nothing becomes an expense until the user
-- accepts it. amount is signed as SimpleFIN sends it: negative = money out.
create table public.bank_transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  account_id   uuid not null references public.bank_accounts (id) on delete cascade,
  external_id  text not null,
  posted       date not null,
  amount       numeric not null,
  description  text not null default '',
  payee        text,
  memo         text,
  status       text not null default 'new' check (status in ('new', 'added', 'dismissed')),
  created_at   timestamptz not null default now(),
  unique (account_id, external_id)
);
create index bank_transactions_review on public.bank_transactions (user_id, status, posted desc);
alter table public.bank_transactions enable row level security;
create policy "read own bank transactions" on public.bank_transactions
  for select using (user_id = auth.uid() and public.is_approved());
create policy "review own bank transactions" on public.bank_transactions
  for update using (user_id = auth.uid() and public.is_approved())
  with check (user_id = auth.uid() and public.is_approved());
-- A reviewer may only change the review status — not rewrite what the bank said.
revoke update on public.bank_transactions from authenticated, anon;
grant update (status) on public.bank_transactions to authenticated;

-- ---------------------------------------------------------------------------
-- Expense audit trail
--
-- Written only by a trigger. There are no insert/update/delete policies, so the
-- history can be read by its owner but never edited — which is the point of it.
-- ---------------------------------------------------------------------------
create table public.expense_audit (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  expense_id  uuid not null,
  action      text not null check (action in ('insert', 'update', 'delete')),
  changed_at  timestamptz not null default now(),
  before      jsonb,
  after       jsonb
);
create index expense_audit_lookup on public.expense_audit (user_id, expense_id, changed_at desc);
alter table public.expense_audit enable row level security;
create policy "read own audit" on public.expense_audit
  for select using (user_id = auth.uid() and public.is_approved());

create or replace function public.audit_expense()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner uuid := coalesce(new.user_id, old.user_id);
begin
  -- Deleting a whole account cascades through its expenses. Recording those
  -- would reference a user who no longer exists, so they're skipped.
  if not exists (select 1 from auth.users where id = owner) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    insert into public.expense_audit (user_id, expense_id, action, after)
    values (owner, new.id, 'insert', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(old) is not distinct from to_jsonb(new) then
      return new;
    end if;
    insert into public.expense_audit (user_id, expense_id, action, before, after)
    values (owner, new.id, 'update', to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.expense_audit (user_id, expense_id, action, before)
    values (owner, old.id, 'delete', to_jsonb(old));
    return old;
  end if;
end;
$$;
revoke execute on function public.audit_expense() from public, anon, authenticated;

create trigger expense_audit
  after insert or update or delete on public.expenses
  for each row execute function public.audit_expense();
