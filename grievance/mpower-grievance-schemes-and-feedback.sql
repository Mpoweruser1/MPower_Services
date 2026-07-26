-- ============================================================
-- MPower — Grievance Register: AP Schemes, Document Hints, Feedback
-- (Migration 12)
-- Adds real Andhra Pradesh welfare scheme names as complaint sub-issues
-- (scoped to the AP app specifically, not shared — these names mean
-- nothing outside AP and get renamed by administrations), a required-
-- documents hint per category, and a platform feedback channel.
-- Run AFTER mpower-grievance-identity-verification.sql (or later —
-- order relative to migrations 9-11 doesn't matter, this is independent).
-- ============================================================

begin;

-- ============================================================
-- SECTION 1 — TWO NEW CATEGORIES, SCOPED TO ANDHRA PRADESH SPECIFICALLY
-- Unlike migration 2's shared (app_id = null) categories, these are
-- AP-specific — scheme names are state-specific and get renamed
-- (e.g. "Jagananna Vidya Deevena" -> "Post Matric Scholarships" in 2024).
-- Scoping to app_id means another state's deployment won't show
-- AP-only scheme names, and a future rename is a data update here,
-- not a schema change.
-- ============================================================

with cat as (
  insert into complaint_categories (app_id, category_key, label_en, sort_order) values
    ('8e05b7cc-3488-41f5-b177-5a45ee0bca8b', 'welfare_scheme', 'Welfare Scheme Issues', 12),
    ('8e05b7cc-3488-41f5-b177-5a45ee0bca8b', 'land_property', 'Land & Property Disputes', 13)
  on conflict (app_id, category_key) do nothing
  returning id, category_key
)
insert into complaint_subissues (category_id, subissue_key, label_en, sort_order)
select cat.id, s.subissue_key, s.label_en, s.sort_order
from cat
join (values
  -- Current official scheme names (post-2024 rename — see notes below)
  ('welfare_scheme', 'talliki_vandanam',    'Talliki Vandanam Scheme — payment not received', 1),
  ('welfare_scheme', 'annadata_sukhibhava', 'Annadata Sukhibhava — farmer support not received', 2),
  ('welfare_scheme', 'ntr_bharosa_pension', 'NTR Bharosa Pension Scheme — pension not received', 3),
  ('welfare_scheme', 'ntr_housing',         'NTR Housing Scheme — application/subsidy issue', 4),
  ('welfare_scheme', 'chandranna_kanuka',   'Chandranna Pelli Kanuka — wedding assistance not received', 5),
  ('welfare_scheme', 'aarogyasri',          'Dr. YSR Aarogyasri — cashless treatment denied/delayed', 6),
  ('welfare_scheme', 'post_matric',         'Post Matric Scholarship — tuition/hostel fee not reimbursed', 7),
  ('welfare_scheme', 'other',               'Other scheme (please specify)', 8),

  ('land_property', 'ownership_dispute',    'Land ownership dispute', 1),
  ('land_property', 'survey_encroachment',  'Survey/boundary issue or encroachment', 2),
  ('land_property', 'revenue_record',       'Revenue record (Adangal/Pahani/1B) correction needed', 3),
  ('land_property', 'other',                'Other (please specify)', 4)
) as s(category_key, subissue_key, label_en, sort_order)
  on s.category_key = cat.category_key
on conflict (category_id, subissue_key) do nothing;

-- ============================================================
-- SECTION 2 — REQUIRED-DOCUMENTS HINTS
-- Shown to the citizen when they pick certain categories, so they know
-- what to have ready (and can attach as evidence via the upload feature
-- already built) before describing the issue.
-- ============================================================

create table if not exists complaint_category_documents (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references complaint_categories(id) on delete cascade,
  document_label text not null,
  sort_order integer default 0
);

alter table complaint_category_documents enable row level security;
create policy "read_category_documents" on complaint_category_documents for select using (true);
create policy "admin_writes_category_documents" on complaint_category_documents
  for all using (
    exists (select 1 from users where auth_id = auth.uid() and role in ('grievance_admin', 'developer', 'support'))
  );

with cat as (
  select id, category_key from complaint_categories
  where app_id = '8e05b7cc-3488-41f5-b177-5a45ee0bca8b' and category_key in ('welfare_scheme', 'land_property')
)
insert into complaint_category_documents (category_id, document_label, sort_order)
select cat.id, d.document_label, d.sort_order
from cat
join (values
  ('land_property', 'Proof of ownership — passbook copy, registered sale deed, or title deed', 1),
  ('land_property', 'Revenue records — recent Adangal/Pahani or 1B copy showing ownership history', 2),
  ('land_property', 'Survey number, boundary map, or geo-tagged photos (for encroachment issues)', 3),

  ('welfare_scheme', 'Aadhaar Card copy', 1),
  ('welfare_scheme', 'Ration Card (Rice Card) copy', 2),
  ('welfare_scheme', 'Income Certificate (MeeSeva/Sachivalayam issued)', 3)
) as d(category_key, document_label, sort_order)
  on d.category_key = cat.category_key;

-- ============================================================
-- SECTION 3 — PLATFORM FEEDBACK
-- Separate from complaints entirely — this is feedback about the
-- APP itself (usability, missing features, general comments), not a
-- grievance about a government service. Any signed-in citizen or staff
-- member can leave it; only admins/Mpower staff read it.
-- ============================================================

create table if not exists app_feedback (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  citizen_id uuid references citizens(id) on delete set null,
  user_id uuid references users(id) on delete set null,
  rating smallint check (rating between 1 and 5),
  comments text,
  context text, -- e.g. 'citizen_portal', 'staff_dashboard'
  created_at timestamptz not null default now(),
  constraint chk_feedback_author check (
    (citizen_id is not null)::int + (user_id is not null)::int = 1
  )
);

create index if not exists idx_app_feedback_app on app_feedback(app_id, created_at desc);

alter table app_feedback enable row level security;

create policy "citizen_submits_feedback" on app_feedback
  for insert with check (
    citizen_id in (select id from citizens where auth_id = auth.uid())
  );

create policy "staff_submits_feedback" on app_feedback
  for insert with check (
    user_id in (select id from users where auth_id = auth.uid())
  );

create policy "admin_reads_feedback" on app_feedback
  for select using (
    app_id = current_app_id()
    and exists (select 1 from users where auth_id = auth.uid() and role = 'grievance_admin')
  );

create policy "mpower_staff_reads_all_feedback" on app_feedback
  for select using (
    exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support'))
  );

commit;

-- ============================================================
-- Notes
-- ============================================================
-- 1. Scheme names WILL change again — Andhra Pradesh renamed six
--    welfare schemes in mid-2024 alone (removing "Jagananna"/"YSR"
--    prefixes). The names seeded here are current as of this writing;
--    when they change again, it's a data update to complaint_subissues
--    (deactivate the old row, insert the new one), never a schema or
--    app-code change — this is exactly why these live in a database
--    table instead of being hardcoded anywhere.
-- 2. complaint_category_documents is intentionally simple (just a
--    label, no translation table yet) — add one later the same way
--    migration 3 added translations for categories, if needed.
-- 3. app_feedback deliberately has NO citizen-facing read policy —
--    once submitted, a citizen can't see their own past feedback (or
--    anyone else's). If you want them to see their own submission
--    history, that's a small additional policy, not a redesign.
