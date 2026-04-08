-- 1. Create a composite index to speed up verification code lookups
-- This index targets the exact query pattern used in EmailService.verifyOtp
CREATE INDEX IF NOT EXISTS idx_verification_codes_lookup 
ON public.verification_codes (email, type, expires_at);

-- 2. Create the cleanup function
CREATE OR REPLACE FUNCTION purge_expired_verification_codes()
RETURNS void AS $$
BEGIN
    DELETE FROM public.verification_codes
    -- We keep them for 24 hours after expiry for security auditing purposes
    -- as discussed in Phase 2 recommendations.
    WHERE expires_at < (now() - interval '24 hours');
END;
$$ LANGUAGE plpgsql;

-- 3. Documentation for Cron Setup (if pg_cron is enabled)
/*
SELECT cron.schedule(
    'purge-verification-codes',
    '0 0 * * *', -- Run every night at midnight 
    'SELECT purge_expired_verification_codes()'
);
*/
