-- Task 3: permanent canonical email identity policy.
--
-- This migration must run only during the approved auth-maintenance window.
-- The DELETE invalidates all active email OTP and reset credentials so no
-- record created under a previous identity/token policy can be consumed.

BEGIN;

DELETE FROM public.verification_codes;

DROP INDEX IF EXISTS public.idx_verification_codes_email_code;
DROP INDEX IF EXISTS public.idx_verification_codes_lookup;
DROP INDEX IF EXISTS public.verification_codes_email_type_idx;
DROP INDEX IF EXISTS public.idx_verification_codes_expires_at;
DROP INDEX IF EXISTS public.verification_codes_expires_at_idx;
DROP INDEX IF EXISTS public.verification_codes_type_code_hash_idx;
DROP INDEX IF EXISTS public.verification_codes_type_code_idx;

ALTER TABLE public.verification_codes
  DROP COLUMN code,
  ADD COLUMN recipient_email text NOT NULL,
  ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.verification_codes
  -- Provider-specific canonicalization intentionally remains in
  -- normalizeEmail(); this constraint only rejects obviously noncanonical
  -- whitespace/casing at the storage boundary.
  ADD CONSTRAINT verification_codes_email_canonical_shape_check
    CHECK (email = btrim(email) AND email = lower(email) AND length(email) > 3),
  ADD CONSTRAINT verification_codes_recipient_email_check
    CHECK (recipient_email = btrim(recipient_email) AND length(recipient_email) > 3),
  ADD CONSTRAINT verification_codes_record_shape_check
    CHECK (
      (
        type IN ('signup', 'login_mfa', 'forgot_password')
        AND code_version = 'otp_hmac_sha256_v1'
        AND code_hash IS NOT NULL
        AND code_salt IS NOT NULL
        AND auth_user_id IS NULL
      )
      OR
      (
        type = 'reset_token'
        AND code_version = 'reset_hmac_sha256_v1'
        AND code_hash IS NOT NULL
        AND code_salt IS NULL
        AND auth_user_id IS NOT NULL
      )
    );

ALTER TABLE public.verification_codes
  ADD CONSTRAINT verification_codes_email_type_key UNIQUE (email, type);

CREATE UNIQUE INDEX verification_codes_type_code_hash_key
  ON public.verification_codes (type, code_hash)
  WHERE code_hash IS NOT NULL;

CREATE INDEX verification_codes_expires_at_idx
  ON public.verification_codes (expires_at);

-- PostgreSQL does not create an index for the referencing side of a foreign
-- key.  Reset-token cleanup and Auth-user deletes both filter by this column.
CREATE INDEX verification_codes_auth_user_id_idx
  ON public.verification_codes (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.verification_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.verification_codes FROM anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.verification_codes TO service_role;

CREATE OR REPLACE FUNCTION public.check_user_exists(email_input text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM auth.users
    WHERE email = email_input
  );
$function$;

REVOKE ALL ON FUNCTION public.check_user_exists(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_user_exists(text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_user_exists(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_canonical_email(email_input text)
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
AS $function$
  SELECT id
  FROM auth.users
  WHERE email = email_input
    AND email_input IS NOT NULL
    AND email_input = btrim(email_input)
    AND email_input = lower(email_input);
$function$;

REVOKE ALL ON FUNCTION public.get_auth_user_id_by_canonical_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_auth_user_id_by_canonical_email(text)
  FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_auth_user_id_by_canonical_email(text) TO service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_verification_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO pg_catalog
AS $function$
BEGIN
  DELETE FROM public.verification_codes
  WHERE expires_at < now();
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_expired_verification_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_verification_codes()
  FROM anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable()
  FROM anon, authenticated, service_role;

-- `auth.users.email` is the durable canonical identity after this migration.
-- The phone projection must copy it verbatim, rather than maintain a second
-- lower/trim email transform that could drift from normalizeEmail().
CREATE OR REPLACE FUNCTION public.sync_auth_user_phone_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  candidate_phone text := nullif(trim(coalesce(new.phone, new.raw_user_meta_data ->> 'phone')), '');
  canonical_email text := nullif(new.email, '');
BEGIN
  IF candidate_phone IS NULL THEN
    DELETE FROM public.auth_user_phone_identities
    WHERE user_id = new.id;
    RETURN new;
  END IF;

  INSERT INTO public.auth_user_phone_identities (
    user_id, phone, email, is_verified, created_at, updated_at
  )
  VALUES (
    new.id,
    candidate_phone,
    canonical_email,
    new.phone_confirmed_at IS NOT NULL,
    timezone('utc', now()),
    timezone('utc', now())
  )
  ON CONFLICT (user_id) DO UPDATE
  SET phone = excluded.phone,
      email = excluded.email,
      is_verified = excluded.is_verified,
      updated_at = timezone('utc', now());

  RETURN new;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_auth_user_phone_identity() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_auth_user_phone_identity()
  FROM anon, authenticated, service_role;

-- Reconcile the undocumented phone projection from the current Auth source
-- before the Admin API migration runs. This backfills a missing projection
-- without altering auth.users; a duplicate phone instead aborts this whole
-- transaction, never choosing or merging an identity. Existing phone and
-- verification fields are intentionally left untouched; only the projection's
-- email is reconciled. The trigger above keeps subsequently changed users
-- synchronized without a second email canonicalizer.
INSERT INTO public.auth_user_phone_identities (
  user_id, phone, email, is_verified, created_at, updated_at
)
SELECT
  auth_user.id,
  source.phone,
  nullif(auth_user.email, ''),
  auth_user.phone_confirmed_at IS NOT NULL,
  timezone('utc', now()),
  timezone('utc', now())
FROM auth.users AS auth_user
CROSS JOIN LATERAL (
  SELECT nullif(trim(coalesce(auth_user.phone, auth_user.raw_user_meta_data ->> 'phone')), '') AS phone
) AS source
WHERE source.phone IS NOT NULL
ON CONFLICT (user_id) DO UPDATE
SET email = excluded.email,
    updated_at = timezone('utc', now());

DO $cron$
DECLARE
  purge_job_id bigint;
BEGIN
  SELECT jobid
  INTO purge_job_id
  FROM cron.job
  WHERE jobname = 'purge-verification-codes'
    AND database = current_database()
  ORDER BY jobid
  LIMIT 1;

  IF purge_job_id IS NULL THEN
    PERFORM cron.schedule_in_database(
      'purge-verification-codes',
      '*/15 * * * *',
      'SELECT public.purge_expired_verification_codes()',
      current_database()
    );
  ELSE
    PERFORM cron.alter_job(
      purge_job_id,
      schedule => '*/15 * * * *',
      command => 'SELECT public.purge_expired_verification_codes()',
      database => current_database(),
      active => true
    );
  END IF;
END;
$cron$;

NOTIFY pgrst, 'reload schema';

COMMIT;
