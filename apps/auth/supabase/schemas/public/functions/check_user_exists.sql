CREATE OR REPLACE FUNCTION public.check_user_exists (
  email_input text
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1
    from auth.users
    where email = email_input
  );
$function$;

REVOKE ALL ON FUNCTION "public"."check_user_exists"(text) FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT EXECUTE ON FUNCTION "public"."check_user_exists"(text) TO "service_role";
