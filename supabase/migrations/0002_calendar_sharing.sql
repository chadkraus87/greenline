-- Calendar sharing between accounts (applied 2026-08-04).
--
-- Scope: EVENTS ONLY. Bills, incomes, expenses, goals, sinking funds and debts
-- are never shared — their "own rows" policies are untouched, so a shared user
-- sees zero financial rows. Verified by the adversarial tests in docs/V2_PLAN.md.
--
-- Flow: owner invites by email (pending) -> recipient accepts -> events visible
-- at the granted permission. Either side can remove the link at any time.

create type public.share_permission as enum ('read', 'write');
create type public.share_status     as enum ('pending', 'accepted', 'declined', 'revoked');

create table public.calendar_shares (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null references auth.users (id) on delete cascade default auth.uid(),
  shared_with_id uuid not null references auth.users (id) on delete cascade,
  permission     public.share_permission not null default 'read',
  status         public.share_status     not null default 'pending',
  created_at     timestamptz not null default now(),
  responded_at   timestamptz,
  unique (owner_id, shared_with_id),
  constraint no_self_share check (owner_id <> shared_with_id)
);
alter table public.calendar_shares enable row level security;

alter table public.events add column if not exists created_by uuid references auth.users (id) default auth.uid();

-- SECURITY DEFINER so event policies can consult calendar_shares without
-- recursing through its own RLS. Each only ever reports the CALLER's access.
create or replace function public.can_read_calendar(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.calendar_shares
                 where owner_id = target and shared_with_id = auth.uid() and status = 'accepted');
$$;

create or replace function public.can_write_calendar(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.calendar_shares
                 where owner_id = target and shared_with_id = auth.uid()
                   and status = 'accepted' and permission = 'write');
$$;

revoke execute on function public.can_read_calendar(uuid)  from anon, authenticated, public;
revoke execute on function public.can_write_calendar(uuid) from anon, authenticated, public;
grant  execute on function public.can_read_calendar(uuid)  to authenticated;
grant  execute on function public.can_write_calendar(uuid) to authenticated;

create policy "shares: read own side" on public.calendar_shares
  for select using (public.is_approved() and (owner_id = auth.uid() or shared_with_id = auth.uid()));
create policy "shares: owner creates" on public.calendar_shares
  for insert with check (public.is_approved() and owner_id = auth.uid());
create policy "shares: owner or recipient updates" on public.calendar_shares
  for update using (public.is_approved() and (owner_id = auth.uid() or shared_with_id = auth.uid()))
  with check (public.is_approved() and (owner_id = auth.uid() or shared_with_id = auth.uid()));
create policy "shares: owner or recipient removes" on public.calendar_shares
  for delete using (public.is_approved() and (owner_id = auth.uid() or shared_with_id = auth.uid()));

-- The update policy lets the recipient touch the row (to accept/decline); this
-- trigger stops them promoting themselves from read to write.
create or replace function public.guard_share_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() = old.shared_with_id and auth.uid() <> old.owner_id then
    if new.permission is distinct from old.permission then
      raise exception 'only the calendar owner can change permission';
    end if;
    if new.status not in ('accepted', 'declined') then
      raise exception 'recipient may only accept or decline';
    end if;
  end if;
  if new.status is distinct from old.status then
    new.responded_at := now();
  end if;
  return new;
end;
$$;
create trigger calendar_share_guard
  before update on public.calendar_shares
  for each row execute function public.guard_share_update();

drop policy "own rows" on public.events;
create policy "events: read own or shared" on public.events
  for select using (public.is_approved() and (user_id = auth.uid() or public.can_read_calendar(user_id)));
create policy "events: insert own or writable" on public.events
  for insert with check (public.is_approved() and (user_id = auth.uid() or public.can_write_calendar(user_id)));
create policy "events: update own or writable" on public.events
  for update using (public.is_approved() and (user_id = auth.uid() or public.can_write_calendar(user_id)))
  with check (public.is_approved() and (user_id = auth.uid() or public.can_write_calendar(user_id)));
create policy "events: delete own or writable" on public.events
  for delete using (public.is_approved() and (user_id = auth.uid() or public.can_write_calendar(user_id)));

-- Invite by email without exposing auth.users. Returns the same shape whether
-- or not the address has an account, so it can't enumerate registered users.
create or replace function public.invite_calendar_share(
  invitee_email text, perm public.share_permission default 'read'
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if not public.is_approved() then raise exception 'not authorized'; end if;
  select id into target from auth.users where lower(email) = lower(trim(invitee_email)) limit 1;
  if target is null or target = auth.uid() then
    return jsonb_build_object('ok', true);
  end if;
  insert into public.calendar_shares (owner_id, shared_with_id, permission, status)
  values (auth.uid(), target, perm, 'pending')
  on conflict (owner_id, shared_with_id) do update
    set permission = excluded.permission,
        status = case when public.calendar_shares.status = 'accepted' then 'accepted' else 'pending' end,
        created_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

-- Both directions with the counterparty's email, without loosening profiles RLS.
create or replace function public.list_calendar_shares()
returns table (id uuid, direction text, other_id uuid, other_email text,
               permission public.share_permission, status public.share_status, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id,
         case when s.owner_id = auth.uid() then 'outgoing' else 'incoming' end,
         case when s.owner_id = auth.uid() then s.shared_with_id else s.owner_id end,
         p.email, s.permission, s.status, s.created_at
  from public.calendar_shares s
  join public.profiles p
    on p.id = case when s.owner_id = auth.uid() then s.shared_with_id else s.owner_id end
  where (s.owner_id = auth.uid() or s.shared_with_id = auth.uid()) and public.is_approved()
  order by s.created_at desc;
$$;

revoke execute on function public.invite_calendar_share(text, public.share_permission) from anon, authenticated, public;
revoke execute on function public.list_calendar_shares() from anon, authenticated, public;
revoke execute on function public.guard_share_update() from anon, authenticated, public;
grant  execute on function public.invite_calendar_share(text, public.share_permission) to authenticated;
grant  execute on function public.list_calendar_shares() to authenticated;
