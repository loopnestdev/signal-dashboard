-- =============================================================================
-- 20261025_leaps.sql - LEAPS book (docs/leaps-rules.md): screener, quotes, paper positions, backtest runs
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - sec_quarters gains net income (profit check for banks / insurers) and diluted shares (market cap)
--   - leaps_market / leaps_screen: one row per session (per symbol), written by the collector's 'leaps' job after the close
--   - leaps_quotes: real Cboe LEAPS quotes, only the contracts nearest each book's target delta plus every held contract
--   - leaps_positions: paper positions for books L1 / L2 / L3; whole contracts, filled at the next session's close
--   - leaps_runs / leaps_trades / leaps_equity: 10-year backtests on modeled prices
--   - Backend (service_role) only, like the other collector tables
-- =============================================================================

alter table signal.sec_quarters add column if not exists net_income numeric;
alter table signal.sec_quarters add column if not exists diluted_shares numeric;

create table if not exists signal.leaps_market (
  trade_date       date primary key,
  spy_close        numeric not null,
  spy_high_52w     numeric not null,
  spy_off_high_pct numeric not null,
  vix              numeric,
  market_score     integer,
  state            text not null check (state in ('correction', 'pullback', 'normal')),
  captured_at      timestamptz not null default now()
);

create table if not exists signal.leaps_screen (
  trade_date    date not null,
  symbol        text not null,
  price         numeric,
  high_52w      numeric,
  off_high_pct  numeric,
  market_cap    numeric,
  iv30          numeric,
  vol_ratio     numeric,                 -- iv30 / VIX
  checks        jsonb not null,          -- per-check pass/fail with values
  eligible      boolean not null,        -- passes the quality checks (section 1, liquidity excluded)
  candidate     boolean not null,        -- eligible + market state allows entries + stock off its high
  reason        text,                    -- first failed check
  confirmation  jsonb,                   -- Signa dark pool / flow / LEAPS print check (section 3)
  contracts     jsonb,                   -- per book: chosen contract + price levels (section 8)
  primary key (trade_date, symbol)
);

create table if not exists signal.leaps_quotes (
  trade_date      date not null,
  contract_symbol text not null,
  symbol          text not null,
  expiry          date not null,
  strike          numeric not null,
  bid             numeric,
  ask             numeric,
  iv              numeric,
  delta           numeric,
  open_interest   numeric,
  spot            numeric,
  captured_at     timestamptz not null default now(),
  primary key (trade_date, contract_symbol)
);
create index if not exists leaps_quotes_contract on signal.leaps_quotes (contract_symbol, trade_date desc);

create table if not exists signal.leaps_positions (
  id               bigint generated always as identity primary key,
  book             text not null check (book in ('L1', 'L2', 'L3')),
  rules_version    text not null,
  symbol           text not null,
  contract_symbol  text not null,
  expiry           date not null,
  strike           numeric not null,
  status           text not null check (status in ('pending', 'open', 'closed', 'cancelled')),
  signal_date      date not null,
  market_state     text not null,
  qty              integer not null,          -- contracts bought
  qty_open         integer not null,
  entry_date       date,
  entry_price      numeric,                   -- per share (ask at fill)
  half_date        date,
  half_price       numeric,                   -- per share (bid at fill)
  half_qty         integer,
  exit_date        date,
  exit_price       numeric,
  exit_reason      text,
  pending_action   text,                      -- 'half' | 'close:<reason>' decided after a close, filled next session
  peak_value       numeric,                   -- highest bid since the half sale (runner trail)
  last_bid         numeric,
  last_iv          numeric,
  last_date        date,
  commissions      numeric not null default 0,
  pnl              numeric,
  confirmation     jsonb,
  meta             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now()
);
create index if not exists leaps_positions_status on signal.leaps_positions (status, book);

create table if not exists signal.leaps_runs (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  book             text not null check (book in ('L1', 'L2', 'L3')),
  rules_version    text not null,
  date_from        date not null,
  date_to          date not null,
  starting_balance numeric not null,
  summary          jsonb not null,
  skips            jsonb not null default '{}'::jsonb,
  open_at_end      jsonb not null default '[]'::jsonb
);
create index if not exists leaps_runs_created on signal.leaps_runs (created_at desc);

create table if not exists signal.leaps_trades (
  run_id       uuid not null references signal.leaps_runs (id) on delete cascade,
  trade_id     integer not null,
  symbol       text not null,
  market_state text not null,
  expiry       date not null,
  strike       numeric not null,
  qty          numeric not null,              -- fractional in the backtest
  entry_date   date not null,
  entry_price  numeric not null,
  entry_spot   numeric not null,
  half_date    date,
  half_price   numeric,
  exit_date    date not null,
  exit_price   numeric not null,
  exit_reason  text not null,
  cost         numeric not null,
  pnl          numeric not null,
  half_pnl     numeric,
  runner_pnl   numeric,
  primary key (run_id, trade_id)
);

create table if not exists signal.leaps_equity (
  run_id         uuid not null references signal.leaps_runs (id) on delete cascade,
  date           date not null,
  equity         numeric not null,
  cash           numeric not null,
  open_positions integer not null,
  primary key (run_id, date)
);

do $$
declare t text;
begin
  foreach t in array array['leaps_market', 'leaps_screen', 'leaps_quotes', 'leaps_positions', 'leaps_runs', 'leaps_trades', 'leaps_equity']
  loop
    execute format('alter table signal.%I enable row level security', t);
    execute format('grant all on signal.%I to service_role', t);
  end loop;
end $$;
