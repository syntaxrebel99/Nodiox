CREATE OR REPLACE FUNCTION public.sync_auth_user_phone_identity()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
DECLARE
  candidate_phone text := nullif(trim(coalesce(new.phone, new.raw_user_meta_data ->> 'phone')), '');
  canonical_email text := nullif(new.email, '');
BEGIN
  if candidate_phone is null then
    delete from public.auth_user_phone_identities
    where user_id = new.id;

    return new;
  end if;

  insert into public.auth_user_phone_identities (
    user_id,
    phone,
    email,
    is_verified,
    created_at,
    updated_at
  )
  values (
    new.id,
    candidate_phone,
    canonical_email,
    new.phone_confirmed_at is not null,
    timezone('utc', now()),
    timezone('utc', now())
  )
  on conflict (user_id) do update
  set phone = excluded.phone,
      email = excluded.email,
      is_verified = excluded.is_verified,
      updated_at = timezone('utc', now());

  return new;
end;
$function$;

REVOKE ALL ON FUNCTION "public"."sync_auth_user_phone_identity"()
  FROM PUBLIC, "anon", "authenticated", "service_role";
