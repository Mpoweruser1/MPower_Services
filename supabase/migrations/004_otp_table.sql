-- ============================================================
-- MPower — OTP Verification Table
-- Run AFTER 001, 002, 003
-- ============================================================

begin;

create table if not exists otp_verifications (
  id uuid primary key default gen_random_uuid(),
  phone text not null, purpose text not null, otp_code text not null,
  expires_at timestamptz not null, verified boolean default false, verified_at timestamptz,
  created_at timestamptz default now()
);

alter table otp_verifications enable row level security;

create policy "otp_service_role_only" on otp_verifications
  for all using (auth.role() = 'service_role');

commit;