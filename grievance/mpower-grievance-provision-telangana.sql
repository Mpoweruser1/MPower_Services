-- ============================================================
-- MPower — Grievance Register: Provision Telangana (Migration 17)
-- Sets up a real second state, end to end, to concretely prove
-- Andhra Pradesh's welfare schemes don't leak into another state's
-- complaint form — and that Telangana's own schemes correctly appear
-- only there. Follows the exact onboarding checklist documented in
-- migration 16's notes, as one chained transaction.
--
-- Telangana scheme names below are current as of mid-2026 (Mahalaxmi,
-- Indiramma Kutumba Jeevitha Bima Pathakam, Dalit Bandhu, Kalyana
-- Lakshmi/Shaadi Mubarak, Aasara Pension, Indiramma Illu, Rythu Bandhu)
-- — verified via web search rather than guessed, same caution held for
-- AP's schemes. Same warning applies: these WILL be renamed again by
-- future administrations (Telangana itself changed several scheme
-- names after its 2023 change of government) — treat this as a
-- starting point to keep current, not a one-time-set list.
-- ============================================================

begin;

with new_app as (
  insert into apps (app_type, org_name, subscription_tier)
  values ('government', 'Government of Telangana', 'standard')
  returning id
),
settings as (
  insert into app_settings (app_id, has_sachivalayam, default_language, state_slug)
  select id, true, 'Telugu', 'telangana' from new_app
  returning app_id
),
branch as (
  insert into branches (app_id, branch_name, district)
  select id, 'Hyderabad', 'Hyderabad' from new_app
  returning id, app_id
),
constituency as (
  insert into constituencies (app_id, branch_id, name, tier, rep_name)
  select branch.app_id, branch.id, 'Hyderabad Central', 'MLC', 'K. Naidu' from branch
  returning id, app_id
),
welfare_cat as (
  -- Same category_key ('welfare_scheme') as AP's — no conflict, since
  -- the uniqueness is on (app_id, category_key), and this is a
  -- different app_id entirely. Each state's own scheme category lives
  -- under its own tenant boundary.
  insert into complaint_categories (app_id, category_key, label_en, min_tier, sort_order)
  select app_id, 'welfare_scheme', 'Welfare Scheme Issues', 'basic', 12 from constituency
  returning id
),
subissues as (
  insert into complaint_subissues (category_id, subissue_key, label_en, sort_order)
  select welfare_cat.id, s.subissue_key, s.label_en, s.sort_order
  from welfare_cat
  cross join (values
    ('mahalaxmi',      'Mahalaxmi Scheme — monthly financial assistance not received', 1),
    ('indiramma_bima', 'Indiramma Kutumba Jeevitha Bima Pathakam — insurance claim issue', 2),
    ('rythu_bandhu',   'Rythu Bandhu — farmer investment support not received', 3),
    ('kalyana_lakshmi','Kalyana Lakshmi / Shaadi Mubarak — marriage assistance not received', 4),
    ('dalit_bandhu',   'Dalit Bandhu — enterprise grant not received', 5),
    ('aasara_pension', 'Aasara Pension — pension not received', 6),
    ('indiramma_illu', 'Indiramma Illu — housing scheme issue', 7),
    ('other',          'Other scheme (please specify)', 8)
  ) as s(subissue_key, label_en, sort_order)
  returning id
)
insert into expected_authorities (app_id, authority_title)
select new_app.id, t.title
from new_app
cross join (values ('Minister — Finance'), ('Deputy Chief Minister'), ('Chief Minister')) as t(title)
returning app_id;

commit;

-- ============================================================
-- Notes
-- ============================================================
-- 1. Save the app_id returned above — you'll need it for bootstrapping
--    Telangana's first grievance_admin, exactly like migration 1's
--    notes described for Andhra Pradesh.
-- 2. To PROVE the isolation live: visit /grievance/andhra-pradesh/citizen
--    and /grievance/telangana/citizen in two separate sessions —
--    Andhra Pradesh's form should show Talliki Vandanam, Annadata
--    Sukhibhava, etc.; Telangana's should show Mahalaxmi, Dalit Bandhu,
--    etc. Neither should ever show the other's scheme names.
-- 3. Telangana's expected_authorities are seeded with no expected_name
--    yet (unlike AP's, also unnamed) — an admin fills that in once
--    known, same as before.
-- 4. mandals/villages for Telangana still need real LGD data, same as
--    every other state — only one constituency was seeded here, purely
--    to make the isolation test possible, not as real coverage.
