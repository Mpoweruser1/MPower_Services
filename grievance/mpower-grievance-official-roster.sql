-- ============================================================
-- MPower — Grievance Register: Official Roster + Staff Profile
-- (Migration 14)
-- Two things: (1) a pre-fillable list of expected authority positions
-- per state (Minister/Dy.CM/CM — representatives already have this via
-- constituencies.rep_name), so admins have something to check a request
-- against rather than trusting a free-text claim alone; (2) photo +
-- phone + emergency contact fields for staff, captured on first login.
-- Run AFTER mpower-grievance-subscription-tiers.sql.
-- ============================================================

begin;

-- ============================================================
-- SECTION 1 — STAFF PROFILE FIELDS
-- users.phone already exists on your platform. Adding what's missing:
-- a photo, and a separate emergency/alternate contact number.
-- ============================================================

alter table users add column if not exists photo_url text;
alter table users add column if not exists alternate_phone text;

-- ============================================================
-- SECTION 2 — EXPECTED AUTHORITY ROSTER
-- Representatives already have an equivalent: constituencies.rep_name
-- is the expected MLA/MP/MLC for that seat, filled in when the
-- constituency itself is created. Authorities (Minister/Dy.CM/CM)
-- had no equivalent — this adds one. Pre-fill expected_name when you
-- know it; leave it null if you don't yet — the admin can still see
-- the position exists and is unclaimed.
-- ============================================================

create table if not exists expected_authorities (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  authority_title text not null,
  expected_name text,
  claimed_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (app_id, authority_title)
);

alter table expected_authorities enable row level security;

create policy "read_expected_authorities" on expected_authorities for select using (true);
create policy "admin_writes_expected_authorities" on expected_authorities
  for all using (
    (app_id = current_app_id() and exists (select 1 from users where auth_id = auth.uid() and role = 'grievance_admin'))
    or exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support'))
  );

-- Seed the Andhra Pradesh positions already in use, unclaimed for now —
-- an admin fills in expected_name later, or leaves it blank until known.
insert into expected_authorities (app_id, authority_title, expected_name) values
  ('8e05b7cc-3488-41f5-b177-5a45ee0bca8b', 'Minister — Rural Development', null),
  ('8e05b7cc-3488-41f5-b177-5a45ee0bca8b', 'Deputy Chief Minister', null),
  ('8e05b7cc-3488-41f5-b177-5a45ee0bca8b', 'Chief Minister', null)
on conflict (app_id, authority_title) do nothing;

commit;

-- ============================================================
-- Notes
-- ============================================================
-- 1. This doesn't replace the verification flow from migration 8/11 —
--    it makes it easier to use. An admin reviewing a request can now
--    check "does this match an expected_authorities row?" as one more
--    signal, alongside the ECI list / gazette / party confirmation
--    already documented there.
-- 2. claimed_by_user_id gets set by the approve-staff-verification
--    Edge Function when an authority request is approved (see the
--    updated function) — not something the app writes directly.
