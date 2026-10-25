-- =============================================================================
-- 20261025_leaps_index_book.sql - LEAPS rules v1.2: index book IX (SPY + QQQ) and the daily LEAPS quote grid
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - Book IX joins L1-L3 on paper positions and backtest runs
--   - IX holds fractional contracts (one SPY/QQQ 0.85-delta LEAPS costs ~$20k), so contract counts become numeric
--   - leaps_quotes gains `grid`: true for the daily research grid (calls near fixed deltas on every monthly expiry 9+ months out)
-- =============================================================================

alter table signal.leaps_positions drop constraint if exists leaps_positions_book_check;
alter table signal.leaps_positions add constraint leaps_positions_book_check check (book in ('L1', 'L2', 'L3', 'IX'));
alter table signal.leaps_runs drop constraint if exists leaps_runs_book_check;
alter table signal.leaps_runs add constraint leaps_runs_book_check check (book in ('L1', 'L2', 'L3', 'IX'));

alter table signal.leaps_positions alter column qty type numeric;
alter table signal.leaps_positions alter column qty_open type numeric;
alter table signal.leaps_positions alter column half_qty type numeric;

alter table signal.leaps_quotes add column if not exists grid boolean not null default false;
create index if not exists leaps_quotes_symbol_date on signal.leaps_quotes (symbol, trade_date);

-- T-bill interest earned by each paper book's idle cash, one row per book per processed session
create table if not exists signal.leaps_interest (
  book        text not null check (book in ('L1', 'L2', 'L3', 'IX')),
  trade_date  date not null,
  amount      numeric not null,
  primary key (book, trade_date)
);
alter table signal.leaps_interest enable row level security;
grant all on signal.leaps_interest to service_role;
