CREATE TRIGGER sync_auth_user_phone_identity
  AFTER INSERT OR UPDATE OF phone, email, phone_confirmed_at, raw_user_meta_data ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_phone_identity();
