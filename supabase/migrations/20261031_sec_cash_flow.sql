-- =============================================================================
-- 20261031_sec_cash_flow.sql - free cash flow inputs on sec_quarters (Fundamentals --> Free cash flow tab)
-- Usage: paste into Supabase (coredb) --> SQL Editor --> Run. Safe to re-run.
--
-- Notes:
--   - Cash flow statements are filed year to date, so quarterly operating cash flow and capex are differences of year-to-date totals
--   - Free cash flow = operating_cash_flow - capex (capex treated as 0 when the filer tags none); computed by the API, not stored
--   - cash = cash and cash equivalents at the quarter end (balance sheet)
--   - Existing rows stay null until the next facts download: run Fundamentals --> "Re-download all" once after this migration
-- =============================================================================

alter table signal.sec_quarters add column if not exists operating_cash_flow numeric;
alter table signal.sec_quarters add column if not exists capex numeric;
alter table signal.sec_quarters add column if not exists cash numeric;
