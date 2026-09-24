CREATE OR REPLACE FUNCTION public.purge_expired_verification_codes()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog'
  AS $function$
BEGIN
  DELETE FROM public.verification_codes
  WHERE expires_at < now();
END;
$function$;

REVOKE ALL ON FUNCTION "public"."purge_expired_verification_codes"()
  FROM PUBLIC, "anon", "authenticated", "service_role";
