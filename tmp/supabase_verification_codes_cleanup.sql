-- Verification codes cleanup (expired + consumed)
-- Run in Supabase SQL Editor.
-- Optional: enable pg_cron and schedule it to run periodically.

-- 1) One-off cleanup query (safe to run anytime)
delete from public.verification_codes
where expires_at < now()
   or (consumed_at is not null and consumed_at < now() - interval '1 day');

-- 2) (Optional) Scheduled cleanup using pg_cron
-- You must have the pg_cron extension available/enabled in your project.
-- Enable it:
--   create extension if not exists pg_cron;
--
-- Schedule: every 15 minutes
-- select
--   cron.schedule(
--     'verification_codes_cleanup_15m',
--     '*/15 * * * *',
--     $$
--     delete from public.verification_codes
--     where expires_at < now()
--        or (consumed_at is not null and consumed_at < now() - interval '1 day');
--     $$
--   );

