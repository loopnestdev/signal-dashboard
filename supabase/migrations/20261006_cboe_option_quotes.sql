-- =============================================================================
-- 20261006_cboe_option_quotes.sql - option quotes from Cboe: Greeks + daily IV30
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - Requires 20261004_data_collector.sql
--   - Cboe's delayed chain carries Greeks, so paper trades can pick contracts by delta later
--   - iv_daily keeps one 30-day implied volatility reading per symbol per session (needed for IV rank; cannot be back-filled)
-- =============================================================================

alter table signal.option_quotes add column if not exists delta numeric;
alter table signal.option_quotes add column if not exists gamma numeric;
alter table signal.option_quotes add column if not exists theta numeric;
alter table signal.option_quotes add column if not exists vega numeric;
alter table signal.option_quotes add column if not exists source text not null default 'yahoo';

create table if not exists signal.iv_daily (
  symbol      text not null,
  trade_date  date not null,
  iv30        numeric,                 -- Cboe 30-day implied volatility, percent (e.g. 45.74)
  price       numeric,
  captured_at timestamptz not null,
  primary key (symbol, trade_date)
);

alter table signal.iv_daily enable row level security;
grant all on signal.iv_daily to service_role;
