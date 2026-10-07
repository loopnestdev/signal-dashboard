-- =============================================================================
-- 20261007_app_settings.sql - editable app settings (paper trading sizing, costs, AI provider)
-- Usage: paste into Supabase (coredb) --> SQL Editor --> "Run and enable RLS". Safe to re-run.
--
-- Notes:
--   - One JSON document per key ('trading'); the backend validates every write
--   - Backend (service_role) only; the app writes through PUT /api/settings, which requires an admin sign-in
-- =============================================================================

create table if not exists signal.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

alter table signal.app_settings enable row level security;
grant all on signal.app_settings to service_role;
