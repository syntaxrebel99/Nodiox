-- Captured from the Nodiox development Supabase project on 2026-09-22.
--
-- The two preceding migrations are the actual remote ledger history. This
-- migration records schema drift that existed remotely but was never recorded
-- in that ledger: the verification-code hardening columns/indexes, phone
-- identity projection, and RLS event trigger.
--
-- The statements are deliberately idempotent so this migration can be applied
-- normally to the inspected development project (to record its pre-existing
-- drift in the ledger) and can reproduce that baseline on a fresh local
-- project. Do not use migration repair: the approved cutover applies this
-- migration before the Task 3 policy migration.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

COMMENT ON SCHEMA public IS 'standard public schema';
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO PUBLIC;
REVOKE ALL ON SCHEMA public FROM anon;
GRANT USAGE ON SCHEMA public TO anon;
REVOKE ALL ON SCHEMA public FROM authenticated;
GRANT USAGE ON SCHEMA public TO authenticated;
REVOKE ALL ON SCHEMA public FROM pg_database_owner;
GRANT CREATE, USAGE ON SCHEMA public TO pg_database_owner;
REVOKE ALL ON SCHEMA public FROM postgres;
GRANT USAGE ON SCHEMA public TO postgres;
REVOKE ALL ON SCHEMA public FROM service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- Captured verbatim from the declarative remote-schema export. The Task 3
-- migration explicitly locks down its credential tables/functions afterward;
-- these defaults are retained here solely to reproduce the inspected remote
-- baseline rather than silently changing unrelated future public objects.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, UPDATE, USAGE ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLES TO service_role;

ALTER TABLE public.verification_codes
  ADD COLUMN IF NOT EXISTS code_hash text,
  ADD COLUMN IF NOT EXISTS code_salt text,
  ADD COLUMN IF NOT EXISTS code_version text,
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz,
  ADD COLUMN IF NOT EXISTS attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz;

-- The remote inspection reports this column as NOT NULL.  The historical
-- migration omitted that constraint, so make the captured baseline reproduce
-- the live invariant on a fresh reset as well as on the development project.
ALTER TABLE public.verification_codes
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.verification_codes FROM PUBLIC, anon, authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.verification_codes TO postgres, service_role;

CREATE INDEX IF NOT EXISTS idx_verification_codes_lookup
  ON public.verification_codes (email, type, expires_at);

CREATE INDEX IF NOT EXISTS verification_codes_email_type_idx
  ON public.verification_codes (email, type);

CREATE INDEX IF NOT EXISTS verification_codes_expires_at_idx
  ON public.verification_codes (expires_at);

CREATE INDEX IF NOT EXISTS verification_codes_type_code_hash_idx
  ON public.verification_codes (type, code_hash);

CREATE INDEX IF NOT EXISTS verification_codes_type_code_idx
  ON public.verification_codes (type, code);

CREATE TABLE IF NOT EXISTS public.auth_user_phone_identities (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text NOT NULL,
  email text,
  is_verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT auth_user_phone_identities_phone_length CHECK (char_length(phone) >= 8),
  CONSTRAINT auth_user_phone_identities_phone_trimmed CHECK (phone = btrim(phone))
);

ALTER TABLE public.auth_user_phone_identities ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS auth_user_phone_identities_email_idx
  ON public.auth_user_phone_identities (email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS auth_user_phone_identities_phone_idx
  ON public.auth_user_phone_identities (phone);

REVOKE ALL ON TABLE public.auth_user_phone_identities FROM PUBLIC, anon, authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.auth_user_phone_identities TO postgres, service_role;

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
    WHERE email_input IS NOT NULL
      AND NULLIF(trim(email_input), '') IS NOT NULL
      AND lower(auth.users.email) = lower(trim(email_input))
  );
$function$;

GRANT EXECUTE ON FUNCTION public.check_user_exists(text)
  TO anon, authenticated, postgres, service_role;

REVOKE ALL ON FUNCTION public.check_user_exists(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.purge_expired_verification_codes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.verification_codes
  WHERE expires_at < (now() - interval '24 hours');
END;
$function$;

GRANT EXECUTE ON FUNCTION public.purge_expired_verification_codes()
  TO PUBLIC, anon, authenticated, postgres, service_role;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table', 'partitioned table')
  LOOP
    IF cmd.schema_name IS NOT NULL
      AND cmd.schema_name IN ('public')
      AND cmd.schema_name NOT IN ('pg_catalog', 'information_schema')
      AND cmd.schema_name NOT LIKE 'pg_toast%'
      AND cmd.schema_name NOT LIKE 'pg_temp%'
    THEN
      BEGIN
        EXECUTE format('ALTER TABLE IF EXISTS %s ENABLE ROW LEVEL SECURITY', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
    ELSE
      RAISE LOG 'rls_auto_enable: skip % (schema: %)', cmd.object_identity, cmd.schema_name;
    END IF;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.rls_auto_enable()
  TO PUBLIC, anon, authenticated, postgres, service_role;

CREATE OR REPLACE FUNCTION public.sync_auth_user_phone_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
  candidate_phone text := nullif(trim(coalesce(new.phone, new.raw_user_meta_data ->> 'phone')), '');
  normalized_email text := nullif(lower(trim(new.email)), '');
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
    normalized_email,
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

GRANT EXECUTE ON FUNCTION public.sync_auth_user_phone_identity()
  TO PUBLIC, anon, authenticated, postgres, service_role;

DO $trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'sync_auth_user_phone_identity'
      AND tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  ) THEN
    CREATE TRIGGER sync_auth_user_phone_identity
      AFTER INSERT OR UPDATE OF phone, email, phone_confirmed_at, raw_user_meta_data ON auth.users
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_auth_user_phone_identity();
  END IF;
END;
$trigger$;

DO $event_trigger$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_event_trigger WHERE evtname = 'ensure_rls'
  ) THEN
    CREATE EVENT TRIGGER ensure_rls
      ON ddl_command_end
      WHEN TAG IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      EXECUTE FUNCTION public.rls_auto_enable();
  END IF;
END;
$event_trigger$;

COMMIT;
