-- =============================================================================
-- 20261008_flow_daily.sql - daily call vs put flow premium per ticker, for the flow study
-- Usage: paste into Supabase (coredb) --> SQL Editor --> Run. Safe to re-run.
--
-- Notes:
--   - A view over signal.flow_alerts, so it needs no backfill and stays current as the collector writes
--   - security_invoker: callers need access to flow_alerts itself, so RLS on the base table still applies
--   - Backend (service_role) only
-- =============================================================================

create or replace view signal.flow_daily
with (security_invoker = true) as
select
  symbol,
  trade_date,
  coalesce(sum(premium) filter (where option_type = 'CALL'), 0) as call_premium,
  coalesce(sum(premium) filter (where option_type = 'PUT'), 0)  as put_premium,
  count(*) filter (where option_type = 'CALL')                   as call_alerts,
  count(*) filter (where option_type = 'PUT')                    as put_alerts
from signal.flow_alerts
group by symbol, trade_date;

revoke all on signal.flow_daily from anon, authenticated;
grant select on signal.flow_daily to service_role;
