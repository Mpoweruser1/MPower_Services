-- ============================================================
-- MPower — Core Schema Migration (Phase 1)
-- Covers tables touched by: Fee Collection, Attendance, Patient Registration
-- Run in Supabase SQL Editor, in order, as one transaction.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1. PLATFORM CORE (shared across all apps)
-- ------------------------------------------------------------

create table if not exists apps (
  id uuid primary key default gen_random_uuid(),
  app_type text not null check (app_type in ('school', 'hospital', 'pharmacy', 'retail', 'restaurant')),
  org_name text not null,
  subscription_tier text not null default 'basic' check (subscription_tier in ('basic', 'standard', 'advanced', 'specialised')),
  active_modules jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  branch_name text not null,
  address text,
  city text,
  district text,
  pincode text,
  timezone text default 'Asia/Kolkata',
  created_at timestamptz default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_id uuid unique not null references auth.users(id) on delete cascade,
  app_id uuid not null references apps(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  full_name text not null,
  role text not null check (role in ('principal', 'teacher', 'clerk', 'warden', 'parent',
                                       'doctor', 'nurse', 'receptionist', 'pharmacist',
                                       'developer', 'support')),
  phone text,
  language_pref text default 'telugu',
  created_at timestamptz default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  student_id uuid,            -- nullable FK, set below once students table exists
  patient_id uuid,            -- nullable FK, set below once patients table exists
  channel text check (channel in ('whatsapp', 'sms', 'email', 'manual')),
  notif_type text not null,
  message text,
  status text default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed')),
  created_at timestamptz default now()
);

create table if not exists bulk_operation_log (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  operation_type text not null,
  module text not null,
  affected_records integer default 0,
  valid_count integer default 0,
  error_count integer default 0,
  snapshot_before jsonb,
  snapshot_after jsonb,
  undone boolean default false,
  undone_at timestamptz,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 2. SCHOOL — students, attendance, fees
-- ------------------------------------------------------------

create table if not exists students (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  sid text unique not null,
  full_name text not null,
  full_name_telugu text,
  dob date,
  gender text check (gender in ('Male', 'Female', 'Other')),
  class_id uuid,
  section text,
  admission_date date,
  admission_no text,
  caste_category text,
  village_id uuid,
  distance_from_school_km numeric,
  student_type text check (student_type in ('hostel', 'day_scholar')),
  blood_group text,
  mother_tongue text,
  parent_name text,
  parent_phone text,
  parent_phone_type text default 'smartphone' check (parent_phone_type in ('smartphone', 'basic_phone', 'no_phone')),
  photo_url text,
  apaar_id text,
  apaar_consent_signed boolean default false,
  apaar_consent_date date,
  apaar_status text default 'not_started' check (apaar_status in ('not_started', 'pending_consent', 'generated', 'declined')),
  status text default 'active' check (status in ('active', 'promoted', 'passed_out', 'tc_issued')),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists parent_comm_prefs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  channel text default 'whatsapp' check (channel in ('whatsapp', 'sms', 'manual')),
  opted_out boolean default false,
  quiet_hours_start time,
  quiet_hours_end time,
  max_daily_messages integer default 10,
  created_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  date date not null,
  status text not null check (status in ('P', 'A', 'L', 'V')),
  marked_by uuid references users(id) on delete set null,
  marked_via text default 'manual' check (marked_via in ('manual', 'qr', 'face', 'gps')),
  created_at timestamptz default now(),
  unique (student_id, date)
);

create table if not exists fee_structure (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  class_id uuid,
  fee_type text not null,
  amount numeric not null,
  due_date date,
  academic_year text not null,
  created_at timestamptz default now()
);

create table if not exists fee_dues (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  fee_structure_id uuid references fee_structure(id) on delete set null,
  fee_type text not null,
  amount_due numeric not null,
  amount_paid numeric default 0,
  due_date date,
  status text default 'pending' check (status in ('pending', 'partial', 'paid')),
  created_at timestamptz default now()
);

create table if not exists fee_payments (
  id uuid primary key default gen_random_uuid(),
  due_id uuid not null references fee_dues(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  amount numeric not null,
  payment_mode text check (payment_mode in ('Cash', 'UPI', 'Online', 'Cheque')),
  transaction_id text,
  receipt_no text not null,
  collected_by uuid references users(id) on delete set null,
  paid_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 3. HOSPITAL — patients, ABHA
-- ------------------------------------------------------------

create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  patient_uid text unique not null,
  full_name text not null,
  dob date,
  gender text check (gender in ('Male', 'Female', 'Other')),
  phone text,
  address text,
  blood_group text,
  allergies text,
  abha_id text,
  abha_linked boolean default false,
  abha_linked_at timestamptz,
  abha_consent_signed boolean default false,
  abha_consent_date timestamptz,
  photo_url text,
  created_at timestamptz default now()
);

create table if not exists abha_consent_log (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  consent_type text check (consent_type in ('creation', 'linking', 'exchange')),
  otp_verified boolean default false,
  consent_text_language text default 'english',
  signed_at timestamptz default now()
);

create table if not exists abdm_health_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  abha_id text,
  record_type text check (record_type in ('prescription', 'lab_report', 'discharge_summary')),
  record_ref_id uuid,
  milestone_level integer check (milestone_level in (1, 2, 3)),
  shared_with_hiu boolean default false,
  created_at timestamptz default now()
);

-- ------------------------------------------------------------
-- 4. Backfill the nullable FKs on notifications now that
--    students and patients tables exist
-- ------------------------------------------------------------

alter table notifications
  add constraint fk_notifications_student
  foreign key (student_id) references students(id) on delete cascade;

alter table notifications
  add constraint fk_notifications_patient
  foreign key (patient_id) references patients(id) on delete cascade;

-- ------------------------------------------------------------
-- 5. INDEXES — for the queries the wired components actually run
-- ------------------------------------------------------------

create index if not exists idx_students_app_class on students(app_id, class_id, section);
create index if not exists idx_attendance_student_date on attendance(student_id, date);
create index if not exists idx_fee_dues_student on fee_dues(student_id);
create index if not exists idx_fee_payments_due on fee_payments(due_id);
create index if not exists idx_patients_app on patients(app_id, branch_id);
create index if not exists idx_users_auth on users(auth_id);

-- ------------------------------------------------------------
-- 6. ROW LEVEL SECURITY — tenant isolation (app_id boundary)
-- ------------------------------------------------------------

alter table apps enable row level security;
alter table branches enable row level security;
alter table users enable row level security;
alter table students enable row level security;
alter table attendance enable row level security;
alter table fee_structure enable row level security;
alter table fee_dues enable row level security;
alter table fee_payments enable row level security;
alter table patients enable row level security;
alter table abha_consent_log enable row level security;
alter table abdm_health_records enable row level security;
alter table notifications enable row level security;
alter table parent_comm_prefs enable row level security;
alter table bulk_operation_log enable row level security;

-- Helper: resolve the calling user's app_id from their auth session
create or replace function current_app_id()
returns uuid
language sql
security definer
stable
as $$
  select app_id from users where auth_id = auth.uid()
$$;

-- Policy pattern repeated per table: only see rows belonging to your own app_id
create policy "tenant_isolation_students" on students
  for all using (app_id = current_app_id());

create policy "tenant_isolation_patients" on patients
  for all using (app_id = current_app_id());

create policy "tenant_isolation_fee_structure" on fee_structure
  for all using (app_id = current_app_id());

create policy "tenant_isolation_branches" on branches
  for all using (app_id = current_app_id());

create policy "tenant_isolation_users" on users
  for all using (app_id = current_app_id());

create policy "tenant_isolation_bulk_log" on bulk_operation_log
  for all using (app_id = current_app_id());

-- Tables without a direct app_id column — scope via parent's app_id
create policy "tenant_isolation_attendance" on attendance
  for all using (
    student_id in (select id from students where app_id = current_app_id())
  );

create policy "tenant_isolation_fee_dues" on fee_dues
  for all using (
    student_id in (select id from students where app_id = current_app_id())
  );

create policy "tenant_isolation_fee_payments" on fee_payments
  for all using (
    due_id in (
      select fd.id from fee_dues fd
      join students s on s.id = fd.student_id
      where s.app_id = current_app_id()
    )
  );

create policy "tenant_isolation_parent_prefs" on parent_comm_prefs
  for all using (
    student_id in (select id from students where app_id = current_app_id())
  );

create policy "tenant_isolation_abha_consent" on abha_consent_log
  for all using (
    patient_id in (select id from patients where app_id = current_app_id())
  );

create policy "tenant_isolation_abdm_records" on abdm_health_records
  for all using (
    patient_id in (select id from patients where app_id = current_app_id())
  );

create policy "tenant_isolation_notifications" on notifications
  for all using (app_id = current_app_id());

-- apps table itself: a user can only read their own app's row
create policy "tenant_isolation_apps" on apps
  for select using (id = current_app_id());

commit;