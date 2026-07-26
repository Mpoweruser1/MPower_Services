-- ============================================================
-- MPower — Phase 3 Schema Migration
-- Run AFTER 001 and 002
-- ============================================================

begin;

create table if not exists client_onboarding (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references crm_clients(id) on delete cascade,
  setup_step_current integer default 1, setup_completed_at timestamptz,
  checklist_items_done jsonb default '[]'::jsonb, checklist_total integer default 20,
  hardware_printer_tested boolean default false, hardware_whatsapp_tested boolean default false,
  hardware_internet_speed numeric, golive_at timestamptz,
  ack_signed boolean default false, ack_signed_by text, ack_signed_at timestamptz,
  ack_otp_verified boolean default false, ack_doc_url text,
  unique (client_id)
);

create table if not exists setup_wizard_progress (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references crm_clients(id) on delete cascade,
  step_number integer not null, step_name text not null,
  status text default 'pending' check (status in ('pending', 'in_progress', 'done', 'skipped')),
  started_at timestamptz, completed_at timestamptz, data_snapshot jsonb,
  unique (client_id, step_number)
);

create table if not exists client_acknowledgements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references crm_clients(id) on delete cascade,
  ack_number text unique not null, ack_type text check (ack_type in ('golive', 'upgrade', 'feature_delivery', 'issue_resolution')),
  signed_by_name text, signed_by_phone text, otp_verified boolean default false,
  ack_text text, ack_doc_url text, signed_at timestamptz default now()
);

create table if not exists transfer_certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  tc_no text unique not null, issue_date date not null, reason text, fields jsonb,
  fee_dues_cleared boolean default true, override_reason text, conduct_grade text,
  issued_by uuid references users(id) on delete set null, created_at timestamptz default now()
);

create table if not exists certificates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  cert_type text check (cert_type in ('bonafide', 'study', 'character', 'conduct')),
  cert_no text unique not null, issue_date date not null,
  issued_by uuid references users(id) on delete set null, created_at timestamptz default now()
);

create table if not exists transport_routes (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  route_no text not null, driver_name text, driver_phone text, vehicle_no text,
  status text default 'on_time' check (status in ('on_time', 'delayed', 'absent')),
  last_gps_lat numeric, last_gps_lng numeric, last_gps_update timestamptz, created_at timestamptz default now()
);

create table if not exists transport_stops (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references transport_routes(id) on delete cascade,
  stop_name text not null, pickup_time time, stop_order integer
);

create table if not exists transport_students (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  route_id uuid not null references transport_routes(id) on delete cascade,
  stop_id uuid references transport_stops(id) on delete set null
);

create table if not exists transport_maintenance (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  vehicle_no text not null, maintenance_type text, due_date date,
  status text default 'upcoming' check (status in ('upcoming', 'overdue', 'completed'))
);

create table if not exists hostel_rooms (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  room_no text not null, total_beds integer default 2
);

create table if not exists hostel_allocations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  room_id uuid not null references hostel_rooms(id) on delete cascade,
  bed_label text, allocated_at date default current_date
);

create table if not exists meal_attendance (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  meal_date date not null, meal_type text check (meal_type in ('Breakfast', 'Lunch', 'Dinner')),
  present boolean default true, unique (student_id, meal_date, meal_type)
);

create table if not exists hostel_outings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  reason text, out_date date, out_time time, return_expected timestamptz,
  approved_by uuid references users(id) on delete set null,
  status text default 'out' check (status in ('out', 'returned'))
);

create table if not exists hostel_medical_log (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references students(id) on delete cascade,
  issue text, action_taken text, reported_at timestamptz default now(), notified_parent boolean default false
);

create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  activity_name text not null, activity_type text check (activity_type in ('Sports', 'NCC', 'NSS', 'Trip', 'Cultural', 'Other')),
  activity_date date, created_at timestamptz default now()
);

create table if not exists activity_participants (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references activities(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade
);

create table if not exists coaching_classes (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  subject text not null, class_range text, schedule text, created_at timestamptz default now()
);

create table if not exists coaching_participants (
  id uuid primary key default gen_random_uuid(),
  coaching_id uuid not null references coaching_classes(id) on delete cascade,
  student_id uuid not null references students(id) on delete cascade
);

create table if not exists report_templates (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  report_name text not null, module text,
  min_tier text default 'basic' check (min_tier in ('basic', 'standard', 'advanced', 'specialised')),
  config jsonb
);

create table if not exists report_history (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  report_template_id uuid references report_templates(id) on delete set null,
  generated_by uuid references users(id) on delete set null,
  record_count integer, delivery_mode text default 'digital_only' check (delivery_mode in ('digital_only', 'print', 'both')),
  is_archived boolean default true, file_url text, generated_at timestamptz default now()
);

create table if not exists id_cards (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  person_type text check (person_type in ('student', 'staff', 'patient', 'visitor')),
  person_id uuid not null, qr_code text unique, is_active boolean default true, created_at timestamptz default now()
);

create table if not exists search_index (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  entity_type text check (entity_type in ('student', 'staff', 'patient', 'customer')),
  entity_id uuid not null, display_text text not null, search_text text
);

create table if not exists opd_visits (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  doctor_id uuid references doctors(id) on delete set null,
  visit_date date default current_date,
  visit_type text check (visit_type in ('New patient', 'Follow-up', 'Emergency', 'Review')),
  symptoms text, diagnosis text, created_at timestamptz default now()
);

create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  opd_visit_id uuid references opd_visits(id) on delete set null,
  doctor_id uuid references doctors(id) on delete set null,
  medicines jsonb default '[]'::jsonb, created_at timestamptz default now()
);

create table if not exists billing_invoices (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  branch_id uuid references branches(id) on delete set null,
  patient_id uuid references patients(id) on delete set null,
  invoice_no text unique not null, line_items jsonb default '[]'::jsonb,
  gst_amount numeric default 0, total_amount numeric not null, abha_id text,
  payment_mode text, status text default 'pending' check (status in ('pending', 'paid', 'partial')),
  created_at timestamptz default now()
);

create table if not exists client_invoices (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references crm_clients(id) on delete cascade,
  invoice_no text unique not null, amount numeric not null, tier text,
  due_date date, paid_date date, payment_mode text,
  status text default 'pending' check (status in ('pending', 'paid', 'overdue')),
  reminder_count integer default 0
);

create table if not exists modification_requests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references crm_clients(id) on delete cascade,
  ticket_id uuid references support_tickets(id) on delete set null,
  module text, change_description text, estimated_hours numeric, quoted_amount numeric,
  approved_by_client boolean default false, version integer default 1,
  previous_version_id uuid references modification_requests(id),
  started_at timestamptz, delivered_at timestamptz,
  status text default 'submitted' check (status in ('submitted', 'reviewed', 'quote_sent', 'in_development', 'delivered')),
  created_at timestamptz default now()
);

create table if not exists help_content (
  id uuid primary key default gen_random_uuid(),
  screen_code text not null, content_type text check (content_type in ('screen_video', 'field_tooltip', 'welcome_tour')),
  language text default 'Telugu', title text, video_id text, video_duration_secs integer,
  app_type text default 'all', is_active boolean default false, views integer default 0,
  helpful_pct numeric, updated_at timestamptz default now()
);

create table if not exists field_help (
  id uuid primary key default gen_random_uuid(),
  screen_code text not null, field_name text not null, language text default 'Telugu',
  help_type text check (help_type in ('explain', 'example', 'warning', 'scheme_tip')),
  help_text text, trigger_condition text default 'always', views integer default 0
);

create table if not exists help_analytics (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  screen_code text, field_name text, help_type text, language text,
  viewed_at timestamptz default now(), was_helpful boolean
);

create table if not exists bug_reports (
  id uuid primary key default gen_random_uuid(),
  app_id uuid references apps(id) on delete cascade,
  ticket_id uuid references support_tickets(id) on delete set null,
  reported_by uuid references users(id) on delete set null,
  screen_name text, screenshot_url text, annotation_data jsonb,
  user_note text, user_note_translated text, user_language text default 'Telugu',
  created_at timestamptz default now()
);

create table if not exists ticket_translations (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references support_tickets(id) on delete cascade,
  message_id uuid references ticket_messages(id) on delete cascade,
  original_text text, original_language text, translated_text text,
  translated_to text default 'English', created_at timestamptz default now()
);

-- Tables needed by shared/printAuditStamp.js and shared/EmergencyKitGenerator.jsx
create table if not exists print_audit_log (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  printed_by uuid references users(id) on delete set null,
  print_time timestamptz default now(), document_type text, report_id text, module text,
  record_count integer default 1, device_name text, browser_info text,
  content_hash text, verify_token text unique, is_demo_data boolean default false
);

create table if not exists emergency_kit_log (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  kit_type text not null, generated_by uuid references users(id) on delete set null,
  generated_at timestamptz default now(), is_active boolean default true
);

create index if not exists idx_tc_student on transfer_certificates(student_id);
create index if not exists idx_certificates_student on certificates(student_id);
create index if not exists idx_transport_students_route on transport_students(route_id);
create index if not exists idx_hostel_alloc_student on hostel_allocations(student_id);
create index if not exists idx_meal_att_student_date on meal_attendance(student_id, meal_date);
create index if not exists idx_activity_participants_activity on activity_participants(activity_id);
create index if not exists idx_opd_visits_patient on opd_visits(patient_id);
create index if not exists idx_billing_invoices_patient on billing_invoices(patient_id);
create index if not exists idx_client_invoices_client on client_invoices(client_id);
create index if not exists idx_modification_requests_client on modification_requests(client_id);
create index if not exists idx_search_index_app_type on search_index(app_id, entity_type);
create index if not exists idx_print_audit_app on print_audit_log(app_id);
create index if not exists idx_emergency_kit_app on emergency_kit_log(app_id);

alter table client_onboarding enable row level security;
alter table setup_wizard_progress enable row level security;
alter table client_acknowledgements enable row level security;
alter table transfer_certificates enable row level security;
alter table certificates enable row level security;
alter table transport_routes enable row level security;
alter table transport_stops enable row level security;
alter table transport_students enable row level security;
alter table transport_maintenance enable row level security;
alter table hostel_rooms enable row level security;
alter table hostel_allocations enable row level security;
alter table meal_attendance enable row level security;
alter table hostel_outings enable row level security;
alter table hostel_medical_log enable row level security;
alter table activities enable row level security;
alter table activity_participants enable row level security;
alter table coaching_classes enable row level security;
alter table coaching_participants enable row level security;
alter table report_templates enable row level security;
alter table report_history enable row level security;
alter table id_cards enable row level security;
alter table search_index enable row level security;
alter table opd_visits enable row level security;
alter table prescriptions enable row level security;
alter table billing_invoices enable row level security;
alter table client_invoices enable row level security;
alter table modification_requests enable row level security;
alter table help_content enable row level security;
alter table field_help enable row level security;
alter table help_analytics enable row level security;
alter table bug_reports enable row level security;
alter table ticket_translations enable row level security;
alter table print_audit_log enable row level security;
alter table emergency_kit_log enable row level security;

create policy "tenant_transport_routes" on transport_routes for all using (app_id = current_app_id());
create policy "tenant_transport_maintenance" on transport_maintenance for all using (app_id = current_app_id());
create policy "tenant_hostel_rooms" on hostel_rooms for all using (app_id = current_app_id());
create policy "tenant_activities" on activities for all using (app_id = current_app_id());
create policy "tenant_coaching_classes" on coaching_classes for all using (app_id = current_app_id());
create policy "tenant_report_templates" on report_templates for all using (app_id = current_app_id());
create policy "tenant_report_history" on report_history for all using (app_id = current_app_id());
create policy "tenant_id_cards" on id_cards for all using (app_id = current_app_id());
create policy "tenant_search_index" on search_index for all using (app_id = current_app_id());
create policy "tenant_billing_invoices" on billing_invoices for all using (app_id = current_app_id());
create policy "tenant_bug_reports" on bug_reports for all using (app_id = current_app_id());
create policy "tenant_help_analytics" on help_analytics for all using (app_id = current_app_id());
create policy "tenant_print_audit" on print_audit_log for all using (app_id = current_app_id());
create policy "tenant_emergency_kit" on emergency_kit_log for all using (app_id = current_app_id());

create policy "tenant_tc" on transfer_certificates for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_certificates" on certificates for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_transport_stops" on transport_stops for all using (route_id in (select id from transport_routes where app_id = current_app_id()));
create policy "tenant_transport_students" on transport_students for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_hostel_alloc" on hostel_allocations for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_meal_att" on meal_attendance for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_hostel_outings" on hostel_outings for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_hostel_medical" on hostel_medical_log for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_activity_participants" on activity_participants for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_coaching_participants" on coaching_participants for all using (student_id in (select id from students where app_id = current_app_id()));
create policy "tenant_opd_visits" on opd_visits for all using (patient_id in (select id from patients where app_id = current_app_id()));
create policy "tenant_prescriptions" on prescriptions for all using (patient_id in (select id from patients where app_id = current_app_id()));

create policy "control_panel_client_onboarding" on client_onboarding for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_setup_progress" on setup_wizard_progress for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_acks" on client_acknowledgements for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_invoices" on client_invoices for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_mod_requests" on modification_requests for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_help_content" on help_content for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_field_help" on field_help for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));
create policy "control_panel_ticket_translations" on ticket_translations for all using (exists (select 1 from users where auth_id = auth.uid() and role in ('developer', 'support')));

commit;