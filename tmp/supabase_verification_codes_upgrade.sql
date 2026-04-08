-- Verification Codes Hardening (OTP + reset tokens)
-- Apply this in Supabase SQL Editor (or your migration tool).
-- Safe to run multiple times.

begin;

alter table if exists public.verification_codes
  add column if not exists code_hash text,
  add column if not exists code_salt text,
  add column if not exists code_version text,
  add column if not exists consumed_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

-- Indexes for common access patterns
create index if not exists verification_codes_email_type_idx
  on public.verification_codes (email, type);

create index if not exists verification_codes_type_code_hash_idx
  on public.verification_codes (type, code_hash);

create index if not exists verification_codes_expires_at_idx
  on public.verification_codes (expires_at);

-- Optional: keep table tidy by encouraging fast expiry queries
-- (Actual cleanup should be done via scheduled job/cron.)

commit;

