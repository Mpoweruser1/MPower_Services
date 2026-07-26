-- ============================================================
-- MPower — Grievance Register: Multi-State URL Routing (Migration 16)
-- Everything else in this module was already built multi-state from
-- the start (app_id is the tenant boundary on every table). The one
-- real gap: the citizen-facing route had Andhra Pradesh's app_id
-- hardcoded directly in App.jsx, since there was only one state live.
-- This adds a URL slug per state, so /grievance/andhra-pradesh/citizen,
-- /grievance/uttar-pradesh/citizen etc. all resolve to the right
-- tenant — no code change needed to add the next state, just a row.
-- Run AFTER mpower-grievance-staff-photo-bucket.sql.
-- ============================================================

begin;

alter table app_settings add column if not exists state_slug text unique;

update app_settings
set state_slug = 'andhra-pradesh'
where app_id = '8e05b7cc-3488-41f5-b177-5a45ee0bca8b' and state_slug is null;

commit;

-- ============================================================
-- Notes — onboarding a NEW state from here on:
-- ============================================================
-- 1. insert into apps (app_type, org_name, subscription_tier) — as before.
-- 2. insert into app_settings (app_id, has_sachivalayam, default_language,
--    party_name, state_slug) — state_slug is the new part, e.g.
--    'uttar-pradesh'. This is what makes /grievance/uttar-pradesh/citizen
--    work with zero code changes.
-- 3. branches/constituencies/mandals/villages — as before.
-- 4. Category taxonomy: the 11 shared (app_id null) categories are
--    already available to every state automatically. If the new state
--    wants its own welfare-scheme category (like AP's, migration 12),
--    that's a new app_id-scoped insert, same pattern.
-- 5. expected_authorities — seed the state's Minister/Dy.CM/CM
--    positions, same as migration 14 did for AP.
-- 6. First grievance_admin — bootstrap the same way as documented back
--    in migration 1: sign up normally, then a service_role insert into
--    users with role='grievance_admin', since no one can self-assign it.
-- 7. Hindi/Marathi/whatever that state's language needs — still a
--    content task requiring a fluent reviewer, not something to
--    fabricate, same caution as always.
