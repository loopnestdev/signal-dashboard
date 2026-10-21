-- =============================================================================
-- 20261021_sec_fundamentals.sql - SEC quarterly revenue / operating income for moat-finder tickers
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - Universe = moat.research_reports tickers; each one is classified once and re-checked daily
--   - Only US-listed SEC filers that file 10-Q/10-K are kept; foreign listings and ADRs / 20-F / 40-F filers are excluded with a reason
--   - Quarters are permanent history: a 10-Q/10-K filing only adds or restates rows, nothing is pruned
--   - Q4 is not reported on its own in XBRL, so it is derived (annual minus Q1-Q3) and flagged `derived`
--   - Filers without an OperatingIncomeLoss tag get revenue minus CostsAndExpenses, flagged `op_computed`
--   - Backend (service_role) only, like the other collector tables
-- =============================================================================

create table if not exists signal.sec_companies (
  ticker            text primary key,
  cik               integer,
  name              text,
  status            text not null check (status in ('eligible', 'excluded', 'pending')),
  reason            text,                    -- why excluded / pending (null when eligible)
  last_accession    text,                    -- newest 10-Q/10-K accession seen; a change triggers a facts refresh
  last_filed        date,
  last_form         text,
  checked_at        timestamptz,             -- last submissions check
  facts_fetched_at  timestamptz,             -- last companyfacts download
  added_at          timestamptz not null default now()
);

create table if not exists signal.sec_quarters (
  ticker            text not null references signal.sec_companies (ticker) on delete cascade,
  period_end        date not null,
  period_start      date not null,
  fiscal_year       integer,
  fiscal_period     text,                    -- Q1..Q4 from the filing (fp)
  revenue           numeric,
  operating_income  numeric,
  derived           boolean not null default false,  -- Q4 = annual minus the three reported quarters
  op_computed       boolean not null default false,  -- operating income = revenue - CostsAndExpenses (no OperatingIncomeLoss tag)
  form              text,
  filed             date,
  updated_at        timestamptz not null default now(),
  primary key (ticker, period_end)
);
create index if not exists sec_quarters_end on signal.sec_quarters (period_end desc);

alter table signal.sec_companies enable row level security;
alter table signal.sec_quarters enable row level security;
grant all on signal.sec_companies to service_role;
grant all on signal.sec_quarters to service_role;
