CREATE OR REPLACE FUNCTION public.check_user_exists(email_input TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT count(*) INTO user_count FROM auth.users WHERE email = email_input;
  RETURN user_count > 0;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
;
