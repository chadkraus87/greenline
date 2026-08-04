-- Receipt scanning: private image storage, an expense link, and a tamper-proof
-- per-user rate limit for the scan Edge Function (applied 2026-08-04).

-- Objects live under "<user_id>/<file>"; every policy checks that first path
-- segment against auth.uid(), so one user can never read or delete another's.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "receipts: read own" on storage.objects
  for select using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());
create policy "receipts: upload own" on storage.objects
  for insert with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());
create policy "receipts: replace own" on storage.objects
  for update using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved())
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());
create policy "receipts: delete own" on storage.objects
  for delete using (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text and public.is_approved());

alter table public.expenses add column if not exists receipt_path text;

-- Per-user throttle so a runaway client can't rack up API spend.
create table public.receipt_scans (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.receipt_scans enable row level security;
create index receipt_scans_user_time_idx on public.receipt_scans (user_id, created_at desc);

-- Deliberately NO policy: RLS on with no policy means clients get no direct
-- access at all. An earlier revision granted FOR ALL, which let a user DELETE
-- their own log and reset the quota. The definer function below still writes.

-- The cap is a constant, not an argument — an earlier revision took it as a
-- parameter, which let the caller pass their own ceiling.
create or replace function public.claim_receipt_scan()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  recent int;
  cap constant int := 40;  -- per user, per hour
begin
  if not public.is_approved() then return false; end if;
  select count(*) into recent from public.receipt_scans
  where user_id = auth.uid() and created_at > now() - interval '1 hour';
  if recent >= cap then return false; end if;
  insert into public.receipt_scans (user_id) values (auth.uid());
  return true;
end;
$$;

create or replace function public.prune_receipt_scans()
returns void language sql security definer set search_path = '' as $$
  delete from public.receipt_scans where created_at < now() - interval '2 hours';
$$;

revoke execute on function public.claim_receipt_scan()  from anon, authenticated, public;
revoke execute on function public.prune_receipt_scans() from anon, authenticated, public;
grant  execute on function public.claim_receipt_scan()  to authenticated;
