CREATE OR REPLACE FUNCTION public.get_auth_user_id_by_canonical_email (
  email_input text
)
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

REVOKE ALL ON FUNCTION "public"."get_auth_user_id_by_canonical_email"(text)
  FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT EXECUTE ON FUNCTION "public"."get_auth_user_id_by_canonical_email"(text) TO "service_role";
