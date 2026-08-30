-- Per-year mileage rates and filed-year locks.
--
-- Both are additive and safe to re-run. Until this is applied the app keeps
-- working: settings_to_row only sends these keys once they hold a value.

-- The IRS standard mileage rate changes every year, so one scalar silently
-- revalues prior years the moment it's updated. Keyed by year: {"2026": 0.70}.
alter table public.settings
  add column if not exists mileage_rates jsonb not null default '{}'::jsonb;

-- Years the user has marked filed. A guardrail against editing a return that
-- has already gone out — not a permission boundary; it's their own data.
alter table public.settings
  add column if not exists locked_years jsonb not null default '[]'::jsonb;

-- Seed the current per-year rate from the existing scalar so nothing shifts
-- underfoot for anyone already logging mileage.
update public.settings
   set mileage_rates = jsonb_build_object(extract(year from now())::text, mileage_rate)
 where mileage_rates = '{}'::jsonb
   and mileage_rate is not null;
