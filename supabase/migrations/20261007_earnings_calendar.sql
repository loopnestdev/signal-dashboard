-- =============================================================================
-- 20261007_earnings_calendar.sql - upcoming earnings dates for the earnings rules
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - Filled daily from the free Nasdaq earnings calendar (next 30 calendar days, every US-listed company)
--   - Each collected date is replaced in full, so a company that moves its report date drops off the old day
--   - Backend (service_role) only, like the other collector tables
-- =============================================================================

create table if not exists signal.earnings_calendar (
  symbol         text not null,
  report_date    date not null,
  report_time    text not null check (report_time in ('pre-market', 'after-hours', 'unknown')),
  fiscal_quarter text,
  eps_forecast   numeric,
  collected_at   timestamptz not null default now(),
  primary key (symbol, report_date)
);
create index if not exists earnings_calendar_date on signal.earnings_calendar (report_date);

alter table signal.earnings_calendar enable row level security;
grant all on signal.earnings_calendar to service_role;
