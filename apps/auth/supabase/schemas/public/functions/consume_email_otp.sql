CREATE OR REPLACE FUNCTION public.consume_email_otp(
  p_id uuid,
  p_email text,
  p_type text,
  p_code_hash text,
  p_code_salt text,
  p_code_version text,
  p_expires_at timestamp with time zone
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY INVOKER
  SET search_path TO ''
  AS $function$
  WITH consumed AS (
    UPDATE public.verification_codes AS verification_code
    SET consumed_at = now()
    WHERE verification_code.id = p_id
      AND verification_code.email = p_email
      AND verification_code.type = p_type
      AND verification_code.code_hash = p_code_hash
      AND verification_code.code_salt = p_code_salt
      AND verification_code.code_version = p_code_version
      AND verification_code.expires_at = p_expires_at
      AND verification_code.expires_at > now()
      AND verification_code.consumed_at IS NULL
    RETURNING verification_code.id
  )
  SELECT EXISTS (SELECT 1 FROM consumed);
$function$;

REVOKE ALL ON FUNCTION public.consume_email_otp(uuid, text, text, text, text, text, timestamp with time zone)
  FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.consume_email_otp(uuid, text, text, text, text, text, timestamp with time zone)
  TO service_role;
