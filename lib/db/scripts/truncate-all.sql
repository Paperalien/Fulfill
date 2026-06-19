-- truncate-all.sql — DEBUG ONLY. Empties every application table.
--
-- Primary keys do NOT block this; only foreign keys do, and CASCADE resolves
-- them. All PKs here are text/UUID (no identity sequences), so RESTART IDENTITY
-- is unnecessary.
--
-- WARNING: irreversible. This clears the `public` schema only — Supabase
-- `auth.users` is a separate table and is left intact (sign-ins still work, but
-- those users will have no mirror row until they next hit the app). To also wipe
-- auth identities, use the Supabase dashboard (Authentication → Users) or the
-- Auth Admin API.
--
-- PREFERRED: run via the guarded wrapper, which refuses non-local databases
-- unless --i-know-this-is-prod and supports --dry-run:
--   node lib/db/scripts/truncate-all.mjs --dry-run
--   node lib/db/scripts/truncate-all.mjs
--
-- Running this file directly with psql bypasses those guards — NEVER do so
-- against production:
--   psql "$DATABASE_URL" -f lib/db/scripts/truncate-all.sql

TRUNCATE TABLE
  sprint_snapshots,
  tasks,
  columns,
  sprints,
  workspace_invitations,
  workspace_members,
  workspaces,
  users
CASCADE;
