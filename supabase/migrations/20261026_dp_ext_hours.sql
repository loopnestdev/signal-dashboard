-- =============================================================================
-- 20261026_dp_ext_hours.sql - extended-hours flag on dark pool prints
-- Usage: paste into Supabase (coredb) --> SQL Editor --> Run. Safe to re-run.
--
-- Notes:
--   - Signa's dark pool payload gains `is_ext_hours` (2026-10 API change); the collector stores it once Signa sends it
--   - Null on prints collected before then; the mid-November review decides whether the daily rollup excludes extended-hours prints
-- =============================================================================

alter table signal.dp_prints add column if not exists is_ext_hours boolean;
