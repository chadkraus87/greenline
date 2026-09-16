-- Least-privilege grants for the bank sync and audit tables.
--
-- Supabase's default privileges hand anon and authenticated every table
-- privilege, including TRUNCATE, which row-level security does not govern.
-- RLS already blocked every client write these tables don't need; this removes
-- the privileges underneath too, so the protection doesn't rest on a single layer.

revoke all on public.bank_connections, public.bank_credentials, public.bank_accounts,
              public.bank_transactions, public.expense_audit
  from anon;

-- The credential table is only ever touched by the Edge Function (service role).
revoke all on public.bank_credentials from authenticated;

-- Everything else: clients read, and may change a transaction's review status.
revoke insert, update, delete, truncate, trigger, references
  on public.bank_connections, public.bank_accounts, public.expense_audit
  from authenticated;
revoke insert, delete, truncate, trigger, references on public.bank_transactions from authenticated;
-- (update on bank_transactions is already limited to the status column by 0006)
