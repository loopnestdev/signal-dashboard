-- =============================================================================
-- 20261007_backtest_runs.sql - stored replay (backtest) results for the charts
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - One run = one paper book replayed over a date range under one rules version + settings snapshot
--   - Trades and the daily equity curve hang off the run and are deleted with it
--   - Backend (service_role) only
-- =============================================================================

create table if not exists signal.backtest_runs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  book             text not null check (book in ('A', 'B', 'C')),
  rules_version    text not null,
  date_from        date not null,
  date_to          date not null,
  starting_balance numeric not null,
  settings         jsonb not null,
  summary          jsonb not null,
  skips            jsonb not null default '[]'::jsonb,
  open_at_end      jsonb not null default '[]'::jsonb
);
create index if not exists backtest_runs_created on signal.backtest_runs (created_at desc);

create table if not exists signal.backtest_trades (
  run_id          uuid not null references signal.backtest_runs (id) on delete cascade,
  trade_id        integer not null,
  symbol          text not null,
  direction       text not null,
  kind            text not null,
  legs            jsonb not null,
  qty             numeric not null,
  signal_date     date not null,
  entry_date      date not null,
  exit_date       date not null,
  unit_cost       numeric not null,
  exit_unit_value numeric not null,
  risk            numeric not null,
  commissions     numeric not null,
  pnl             numeric not null,
  r_multiple      numeric not null,
  exit_reason     text not null,
  modeled_fills   integer not null default 0,
  shadow_pnl      numeric,
  meta            jsonb not null default '{}'::jsonb,
  primary key (run_id, trade_id)
);

create table if not exists signal.backtest_equity (
  run_id         uuid not null references signal.backtest_runs (id) on delete cascade,
  date           date not null,
  equity         numeric not null,
  cash           numeric not null,
  open_risk      numeric not null,
  open_positions integer not null,
  primary key (run_id, date)
);

do $$
declare t text;
begin
  foreach t in array array['backtest_runs', 'backtest_trades', 'backtest_equity']
  loop
    execute format('alter table signal.%I enable row level security', t);
    execute format('grant all on signal.%I to service_role', t);
  end loop;
end $$;
