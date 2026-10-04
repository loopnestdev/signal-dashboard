-- =============================================================================
-- 20261004_data_collector.sql - Release 1: market data history for backtesting
-- Usage: paste into Supabase (coredb) --> SQL Editor --> Run. Safe to re-run.
--
-- Notes:
--   - All tables live in the existing `signal` schema
--   - RLS is enabled with no policies: only the backend (service_role key) can read/write
--   - Raw dark pool prints are pruned after 60 days; the daily rollup (dp_daily) is kept forever
--   - GEX history is gex_daily, not gex_snapshots (that name is the per-ticker GEX tab cache in routes/stockGex.ts)
-- =============================================================================

-- ── Universe ──────────────────────────────────────────────────────────────────

create table if not exists signal.tracked_symbols (
  symbol      text primary key,
  kind        text not null default 'stock' check (kind in ('stock', 'etf')),
  active      boolean not null default true,
  notes       text,
  added_at    timestamptz not null default now()
);

insert into signal.tracked_symbols (symbol, kind) values
  ('SPY','etf'), ('QQQ','etf'), ('IWM','etf'), ('SMH','etf'),
  ('MU','stock'), ('AMZN','stock'), ('SPCX','stock'), ('AAPL','stock'), ('NVDA','stock'),
  ('META','stock'), ('GOOGL','stock'), ('AVGO','stock'), ('MSFT','stock'), ('TSLA','stock')
on conflict (symbol) do nothing;

-- ── Dark pool (Radon milestone 2) ────────────────────────────────────────────

create table if not exists signal.dp_prints (
  id            text primary key,              -- sha1(symbol|executed_at|price|size)
  symbol        text not null,
  executed_at   timestamptz not null,
  trade_date    date not null,                 -- US/Eastern session date
  price         numeric not null,
  size          integer not null,
  premium       numeric not null,
  nbbo_bid      numeric,
  nbbo_ask      numeric,
  day_volume    bigint,                        -- cumulative lit+dark volume at print time
  side          smallint not null,             -- 1 = at/above mid (buy), -1 = below mid (sell), 0 = no NBBO
  collected_at  timestamptz not null default now()
);
create index if not exists dp_prints_symbol_date on signal.dp_prints (symbol, trade_date);

create table if not exists signal.dp_daily (
  symbol        text not null,
  trade_date    date not null,
  num_prints    integer not null,
  total_volume  bigint not null,
  total_premium numeric not null,
  buy_volume    bigint not null,
  sell_volume   bigint not null,
  dp_buy_ratio  numeric,                       -- buy / (buy + sell); null when nothing classified
  day_volume    bigint,                        -- max cumulative volume seen that session
  updated_at    timestamptz not null default now(),
  primary key (symbol, trade_date)
);

-- ── Options flow alerts (Radon milestone 3) ──────────────────────────────────

create table if not exists signal.flow_alerts (
  id               text primary key,           -- sha1(symbol|type|strike|expiry|start_time|rule)
  symbol           text not null,
  option_type      text not null check (option_type in ('CALL', 'PUT')),
  strike           numeric not null,
  expiry           date not null,
  premium          numeric not null,
  volume           integer,
  open_interest    integer,
  vol_oi_ratio     numeric,
  has_sweep        boolean not null default false,
  has_floor        boolean not null default false,
  underlying_price numeric,
  alert_rule       text,
  alerted_at       timestamptz not null,
  trade_date       date not null,
  collected_at     timestamptz not null default now()
);
create index if not exists flow_alerts_symbol_date on signal.flow_alerts (symbol, trade_date);

create table if not exists signal.curated_flow (
  id                text primary key,
  symbol            text not null,
  direction         text,
  conviction_score  numeric,
  option_type       text,
  strike            numeric,
  expiry            date,
  premium           numeric,
  confirms_signal   boolean,
  contradicts_signal boolean,
  rationale         text,
  scored_at         timestamptz,
  trade_date        date not null,
  payload           jsonb not null,
  collected_at      timestamptz not null default now()
);
create index if not exists curated_flow_symbol_date on signal.curated_flow (symbol, trade_date);

-- ── GEX + Signa signal (one row per symbol per session) ──────────────────────

create table if not exists signal.gex_daily (
  symbol            text not null,
  trade_date        date not null,
  captured_at       timestamptz not null,
  spot              numeric,
  gamma_flip        numeric,
  call_wall         numeric,
  put_wall          numeric,
  max_gamma_strike  numeric,
  regime_above_flip boolean,
  net_gex           numeric,
  strikes           jsonb not null,             -- [[strike, net_gex], ...] summed across expiries, +/-30% of spot
  primary key (symbol, trade_date)
);

create table if not exists signal.signal_snapshots (
  symbol            text not null,
  trade_date        date not null,
  captured_at       timestamptz not null,
  engine_direction  text,
  engine_score      numeric,
  engine_grade      text,
  signa_action      text,
  signa_grade       text,
  conviction        numeric,
  price             numeric,
  entry             numeric,
  stop              numeric,
  target            numeric,
  payload           jsonb not null,
  primary key (symbol, trade_date)
);

-- ── Option quotes (needed later to price paper trades + backtests) ───────────

create table if not exists signal.option_quotes (
  contract_symbol text not null,
  trade_date      date not null,
  symbol          text not null,
  option_type     text not null check (option_type in ('CALL', 'PUT')),
  strike          numeric not null,
  expiry          date not null,
  bid             numeric,
  ask             numeric,
  last            numeric,
  iv              numeric,
  open_interest   integer,
  volume          integer,
  spot            numeric,
  captured_at     timestamptz not null,
  primary key (contract_symbol, trade_date)
);
create index if not exists option_quotes_symbol_date on signal.option_quotes (symbol, trade_date);

-- ── Collector bookkeeping ────────────────────────────────────────────────────

create table if not exists signal.collector_runs (
  id            bigserial primary key,
  job           text not null,
  trade_date    date not null,
  started_at    timestamptz not null,
  finished_at   timestamptz,
  status        text not null check (status in ('ok', 'partial', 'error', 'skipped')),
  api_calls     integer not null default 0,
  rows_written  integer not null default 0,
  message       text
);
create index if not exists collector_runs_started on signal.collector_runs (started_at desc);

create table if not exists signal.api_usage (
  day     date not null,                        -- UTC day
  source  text not null,                        -- 'signa' | 'yahoo-options'
  calls   integer not null default 0,
  primary key (day, source)
);

create or replace function signal.bump_api_usage(p_day date, p_source text, p_calls integer)
returns void language sql as $$
  insert into signal.api_usage (day, source, calls) values (p_day, p_source, p_calls)
  on conflict (day, source) do update set calls = signal.api_usage.calls + excluded.calls;
$$;

-- rollup_dp_daily:
--   - Recomputes dp_daily for one session from the raw prints (idempotent)
--   - Classification follows Radon analyze_darkpool: price >= NBBO mid = buy, below = sell
create or replace function signal.rollup_dp_daily(p_date date)
returns integer language sql as $$
  with agg as (
    select symbol,
           count(*)::int                                         as num_prints,
           sum(size)::bigint                                     as total_volume,
           sum(premium)                                          as total_premium,
           coalesce(sum(size) filter (where side = 1), 0)::bigint  as buy_volume,
           coalesce(sum(size) filter (where side = -1), 0)::bigint as sell_volume,
           max(day_volume)                                       as day_volume
    from signal.dp_prints
    where trade_date = p_date
    group by symbol
  ), up as (
    insert into signal.dp_daily as d
      (symbol, trade_date, num_prints, total_volume, total_premium, buy_volume, sell_volume, dp_buy_ratio, day_volume, updated_at)
    select symbol, p_date, num_prints, total_volume, total_premium, buy_volume, sell_volume,
           case when buy_volume + sell_volume > 0
                then round(buy_volume::numeric / (buy_volume + sell_volume), 4) end,
           day_volume, now()
    from agg
    on conflict (symbol, trade_date) do update set
      num_prints = excluded.num_prints, total_volume = excluded.total_volume,
      total_premium = excluded.total_premium, buy_volume = excluded.buy_volume,
      sell_volume = excluded.sell_volume, dp_buy_ratio = excluded.dp_buy_ratio,
      day_volume = excluded.day_volume, updated_at = now()
    returning 1
  )
  select count(*)::int from up;
$$;

create or replace function signal.prune_dp_prints(p_keep_days integer default 60)
returns integer language sql as $$
  with del as (
    delete from signal.dp_prints where trade_date < current_date - p_keep_days returning 1
  )
  select count(*)::int from del;
$$;

-- ── Access: backend only ─────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['tracked_symbols','dp_prints','dp_daily','flow_alerts','curated_flow',
                           'gex_daily','signal_snapshots','option_quotes','collector_runs','api_usage']
  loop
    execute format('alter table signal.%I enable row level security', t);
    execute format('grant all on signal.%I to service_role', t);
  end loop;
end $$;

grant usage, select on sequence signal.collector_runs_id_seq to service_role;
grant execute on function signal.bump_api_usage(date, text, integer) to service_role;
grant execute on function signal.rollup_dp_daily(date) to service_role;
grant execute on function signal.prune_dp_prints(integer) to service_role;
revoke execute on function signal.bump_api_usage(date, text, integer) from anon, authenticated, public;
revoke execute on function signal.rollup_dp_daily(date) from anon, authenticated, public;
revoke execute on function signal.prune_dp_prints(integer) from anon, authenticated, public;
