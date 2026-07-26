-- ============================================================
-- MPower — Phase 2 Schema Migration
-- Run AFTER 001_core_schema.sql
-- ============================================================

begin;

create table if not exists classes (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  class_name text not null, class_order integer, medium text default 'Telugu',
  created_at timestamptz default now()
);

create table if not exists exams (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  exam_name text not null, exam_type text, academic_year text,
  class_id uuid references classes(id) on delete cascade,
  start_date date, end_date date, created_at timestamptz default now()
);

create table if not exists marks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  exam_id uuid not null references exams(id) on delete cascade,
  subject_id uuid, theory_marks numeric, internal_marks numeric, total numeric,
  percentage numeric, grade text, pass_fail text check (pass_fail in ('pass', 'fail')),
  entered_by uuid references users(id) on delete set null, entered_at timestamptz default now()
);

alter table students add constraint fk_students_class foreign key (class_id) references classes(id) on delete set null;

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  department_name text not null, created_at timestamptz default now()
);

create table if not exists doctors (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  staff_id uuid references users(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  designation text, employment_type text check (employment_type in ('consultant', 'visiting', 'resident', 'senior_resident')),
  registration_no text, consultation_fee numeric, created_at timestamptz default now()
);

create table if not exists wards (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  ward_type text not null check (ward_type in ('General', 'ICU', 'NICU', 'Private', 'Emergency', 'Day care')),
  total_beds integer not null default 0, created_at timestamptz default now()
);

create table if not exists ipd_admissions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  ward_id uuid not null references wards(id) on delete cascade,
  bed_no text not null, admission_date date not null, discharge_date date,
  admitting_doctor_id uuid references doctors(id) on delete set null,
  diagnosis text, created_at timestamptz default now()
);

create table if not exists master_lab_tests (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  test_name text not null, normal_range text, unit text,
  sample_type text check (sample_type in ('blood', 'urine', 'swab', 'other')),
  turnaround_hours integer, created_at timestamptz default now()
);

create table if not exists lab_test_panels (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  panel_name text not null, included_tests jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists lab_tests (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  test_name text not null, ordered_by uuid references users(id) on delete set null,
  sample_collected_at timestamptz, result_ready_at timestamptz, result_file_url text,
  status text default 'pending' check (status in ('pending', 'completed', 'cancelled')),
  created_at timestamptz default now()
);

create table if not exists crm_clients (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete set null,
  org_name text not null, app_type text check (app_type in ('school', 'hospital', 'pharmacy', 'retail', 'restaurant')),
  tier text default 'basic' check (tier in ('basic', 'standard', 'advanced', 'specialised')),
  status text default 'trial' check (status in ('trial', 'active', 'expired', 'suspended')),
  contact_person text, phone text, district text,
  registered_at timestamptz default now(), trial_ended_at timestamptz, next_renewal date, account_manager text
);

create table if not exists sla_config (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('basic', 'standard', 'advanced', 'specialised')),
  ticket_type text not null check (ticket_type in ('bug', 'training', 'modification', 'feature', 'billing')),
  response_hours integer, resolution_hours integer,
  working_hours_only boolean default true, holiday_excluded boolean default true,
  unique (tier, ticket_type)
);

create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references crm_clients(id) on delete cascade,
  ticket_no text unique not null,
  type text not null check (type in ('bug', 'training', 'modification', 'feature', 'billing', 'upgrade')),
  priority text check (priority in ('P1', 'P2', 'P3', 'P4')),
  subject text not null, description text, module text,
  status text default 'open' check (status in ('open', 'in_progress', 'waiting_client', 'resolved', 'closed')),
  raised_at timestamptz default now(), assigned_to uuid references users(id) on delete set null, resolved_at timestamptz
);

create table if not exists ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references support_tickets(id) on delete cascade,
  sender_type text check (sender_type in ('client', 'support')),
  message text not null, attachment_url text, sent_at timestamptz default now()
);

insert into sla_config (tier, ticket_type, response_hours, resolution_hours) values
  ('standard', 'bug', 48, 48), ('advanced', 'bug', 24, 24), ('specialised', 'bug', 4, 4),
  ('standard', 'training', 72, 72), ('advanced', 'training', 48, 48), ('specialised', 'training', 24, 24),
  ('standard', 'modification', 120, 120), ('advanced', 'modification', 72, 72), ('specialised', 'modification', 48, 48),
  ('standard', 'billing', 48, 48), ('advanced', 'billing', 24, 24), ('specialised', 'billing', 24, 24)
on conflict (tier, ticket_type) do nothing;

create index if not exists idx_marks_student_exam on marks(student_id, exam_id);
create index if not exists idx_exams_class on exams(class_id);
create index if not exists idx_ipd_ward on ipd_admissions(ward_id);
create index if not exists idx_ipd_patient on ipd_admissions(patient_id);
create index if not exists idx_lab_tests_patient on lab_tests(patient_id);
create index if not exists idx_lab_tests_status on lab_tests(status);
create index if not exists idx_support_tickets_client on support_tickets(client_id);
create index if not exists idx_ticket_messages_ticket on ticket_messages(ticket_id);

alter table classes enable row level security;
alter table exams enable row level security;
alter table marks enable row level security;
alter table departments enable row level security;
alter table doctors enable row level security;
alter table wards enable row level security;
alter table ipd_admissions enable row level security;
alter table master_lab_tests enable row level security;
alter table lab_test_panels enable row level security;
alter table lab_tests enable row level security;
alter table crm_clients enable row level security;
alter table sla_config enable row level security;
alter table support_tickets enable row level security;
alter table ticket_messages enable row level security;

create policy "tenant_isolation_classes" on classes for all using (app_id = current_app_id());
create policy "tenant_isolation_exams" on exams for all using (app_id = current_app_id());
create policy "tenant_isolation_marks" on marks for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_isolation_departments" on departments for all using (app_id = current_app_id());
create policy "tenant_isolation_doctors" on doctors for all using (app_id = current_app_id());
create policy "tenant_isolation_wards" on wards for all using (app_id = current_app_id());
create policy "tenant_isolation_ipd" on ipd_admissions for all using (patient_id in (select id from patients where app_id = current_app_id()));
create policy "tenant_isolation_master_lab_tests" on master_lab_tests for all using (app_id = current_app_id());
create policy "tenant_isolation_lab_panels" on lab_test_panels for all using (app_id = current_app_id());
create policy "tenant_isolation_lab_tests" on lab_tests for all using (app_id = current_app_id());

create policy "sla_config_read_all" on sla_config for select using (true);

create policy "control_panel_staff_only_clients" on crm_clients for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_staff_only_tickets" on support_tickets for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_staff_only_messages" on ticket_messages for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));

commit;