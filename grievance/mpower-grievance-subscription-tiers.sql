-- ============================================================
-- MPower — Grievance Register: Subscription-Tier Gating (Migration 13)
-- Lets different categories/features be gated by subscription tier,
-- same pattern report_templates already uses (min_tier). Core categories
-- stay available to every tier; newer additions (welfare schemes, land
-- disputes) can be reserved for higher tiers if that's the commercial
-- model you want.
-- Run AFTER mpower-grievance-schemes-and-feedback.sql.
-- ============================================================

begin;

alter table complaint_categories add column if not exists min_tier text not null default 'basic'
  check (min_tier in ('basic', 'standard', 'advanced', 'specialised'));

-- Example split, matching what you described: core civic categories
-- (electricity, water, drainage, etc. — everything from the original
-- paper form) stay on every tier. The newer AP-scheme-specific
-- categories from migration 12 are gated to 'standard' and above —
-- change these to whatever your actual pricing model should be, this
-- is just a starting point.
update complaint_categories
set min_tier = 'standard'
where category_key in ('welfare_scheme', 'land_property');

commit;

-- ============================================================
-- Notes
-- ============================================================
-- 1. Tier ordering (basic < standard < advanced < specialised) needs to
--    be enforced in the app layer, not the database — Postgres text
--    comparison alone doesn't know 'standard' > 'basic'. See the
--    TENANT_TIER_ORDER map added to grievanceApi.js.
-- 2. This only gates which categories a CITIZEN sees when filing a
--    complaint. If you also want to gate reporting/reps/etc. by tier,
--    report_templates.min_tier already does that for the Reports
--    Dashboard — nothing new needed there.
