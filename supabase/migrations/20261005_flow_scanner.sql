-- =============================================================================
-- 20261005_flow_scanner.sql - Release 1.1: market-wide flow scanner
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - Requires 20261004_data_collector.sql
--   - tracked_symbols gains a source: 'core' rows never expire, 'scanner' rows expire after expires_at
--   - New tables follow the same access model: RLS on, no policies, backend (service_role) only
-- =============================================================================

-- ── Universe: core vs scanner-promoted ───────────────────────────────────────

alter table signal.tracked_symbols add column if not exists source text not null default 'core';
alter table signal.tracked_symbols add column if not exists expires_at date;
alter table signal.tracked_symbols add column if not exists promoted_at timestamptz;
alter table signal.tracked_symbols add column if not exists last_score numeric;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tracked_symbols_source_check') then
    alter table signal.tracked_symbols
      add constraint tracked_symbols_source_check check (source in ('core', 'scanner', 'manual'));
  end if;
end $$;

-- ── Market-wide large prints (discovery feed) ────────────────────────────────

create table if not exists signal.raw_flow (
  id               text primary key,             -- Signa/UW execution id
  symbol           text not null,
  option_type      text not null check (option_type in ('CALL', 'PUT')),
  strike           numeric not null,
  expiry           date not null,
  dte              integer,
  premium          numeric not null,
  volume           integer,
  open_interest    integer,
  vol_oi_ratio     numeric,
  is_sweep         boolean not null default false,
  is_block         boolean not null default false,
  iv               numeric,
  underlying_price numeric,
  signal_type      text,
  sentiment        text,
  unusual_score    numeric,
  executed_at      timestamptz not null,
  trade_date       date not null,
  collected_at     timestamptz not null default now()
);
create index if not exists raw_flow_date_symbol on signal.raw_flow (trade_date, symbol);

-- ── Signa 30-model scan (technical cross-check, refreshed nightly by Signa) ──

create table if not exists signal.signa_scans (
  symbol       text not null,
  trade_date   date not null,
  direction    text not null,
  signal       text,
  score        numeric,
  grade        text,
  confidence   numeric,
  model_count  integer,
  reasons      jsonb,
  captured_at  timestamptz not null,
  primary key (symbol, trade_date, direction)
);

-- ── Scanner output: one row per symbol per session (latest run wins) ─────────

create table if not exists signal.scanner_candidates (
  symbol            text not null,
  trade_date        date not null,
  run_at            timestamptz not null,
  score             numeric not null,             -- Radon discover.py 0-100
  breakdown         jsonb not null,               -- weighted component points
  options_bias      text not null,                -- BULLISH | BEARISH | MIXED (call vs put print counts)
  dp_direction      text not null,                -- ACCUMULATION | DISTRIBUTION | NEUTRAL | NO_DATA
  dp_strength       numeric not null,
  dp_buy_ratio      numeric,
  dp_sustained_days integer not null,
  confluence        boolean not null,
  alerts            integer not null,
  calls             integer not null,
  puts              integer not null,
  sweeps            integer not null,
  avg_vol_oi        numeric not null,
  total_premium     numeric not null,
  underlying_price  numeric,
  max_open_interest integer,
  signa_direction   text,                         -- Signa scan direction for this symbol today, if listed
  passed_filters    boolean not null,
  rejected_reason   text,
  promoted          boolean not null default false,
  primary key (symbol, trade_date)
);
create index if not exists scanner_candidates_date_score on signal.scanner_candidates (trade_date, score desc);

-- ── Access: backend only ─────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['raw_flow', 'signa_scans', 'scanner_candidates']
  loop
    execute format('alter table signal.%I enable row level security', t);
    execute format('grant all on signal.%I to service_role', t);
  end loop;
end $$;
