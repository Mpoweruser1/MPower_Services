-- ============================================================
-- MPower — Grievance Register: Staff Photo Storage (Migration 15)
-- Private bucket for representative/authority profile photos, same
-- pattern as the complaint-evidence bucket (migration 10).
-- Run AFTER mpower-grievance-official-roster.sql.
-- ============================================================

begin;

insert into storage.buckets (id, name, public)
values ('staff-photos', 'staff-photos', false)
on conflict (id) do nothing;

-- File path convention: <user_id>/photo.<ext> — one photo per staff
-- member, uploads overwrite the previous one.

create policy "staff_photo_select_own_or_scope" on storage.objects
  for select using (
    bucket_id = 'staff-photos'
    and exists (
      select 1 from users u
      where u.id::text = (storage.foldername(name))[1]
        and (
          u.auth_id = auth.uid()
          or exists (
            select 1 from users viewer
            where viewer.auth_id = auth.uid()
              and viewer.app_id = u.app_id
              and viewer.role in ('grievance_admin', 'developer', 'support')
          )
        )
    )
  );

create policy "staff_photo_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'staff-photos'
    and exists (
      select 1 from users u
      where u.id::text = (storage.foldername(name))[1]
        and u.auth_id = auth.uid()
    )
  );

commit;

-- ============================================================
-- Notes
-- ============================================================
-- 1. Private bucket — always serve via a signed URL, never a public
--    link, same as complaint-evidence.
-- 2. A staff member can upload/replace only their OWN photo. Admins
--    (and Mpower staff) can VIEW any photo within their own tenant, for
--    verification purposes, but can't upload on someone else's behalf.
