-- =============================================================================
-- 20261025_leaps_split_index_books.sql - LEAPS rules v1.3: index book IX split into IS (SPY) and IQ (QQQ)
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - IS and IQ each hold one index (30% of their own book); IX stays allowed so earlier IX backtest runs remain readable
-- =============================================================================

alter table signal.leaps_positions drop constraint if exists leaps_positions_book_check;
alter table signal.leaps_positions add constraint leaps_positions_book_check check (book in ('L1', 'L2', 'L3', 'IX', 'IS', 'IQ'));
alter table signal.leaps_runs drop constraint if exists leaps_runs_book_check;
alter table signal.leaps_runs add constraint leaps_runs_book_check check (book in ('L1', 'L2', 'L3', 'IX', 'IS', 'IQ'));
alter table signal.leaps_interest drop constraint if exists leaps_interest_book_check;
alter table signal.leaps_interest add constraint leaps_interest_book_check check (book in ('L1', 'L2', 'L3', 'IX', 'IS', 'IQ'));
