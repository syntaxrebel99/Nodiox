BEGIN;

SELECT plan(37);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.verification_codes'::regclass
      AND relrowsecurity
  ),
  'verification_codes has RLS enabled'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'verification_codes'
      AND column_name = 'recipient_email'
  ),
  'verification_codes stores recipient_email separately'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'verification_codes'
      AND column_name = 'auth_user_id'
  ),
  'verification_codes binds reset tokens to auth user IDs'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'verification_codes'
      AND column_name = 'code'
  ),
  'verification_codes has no legacy plaintext code column'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.verification_codes', 'select'),
  'anon cannot select verification credentials'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.verification_codes', 'insert'),
  'authenticated cannot write verification credentials'
);

SELECT ok(
  has_table_privilege('service_role', 'public.verification_codes', 'select, insert, update, delete'),
  'service_role can manage verification credentials'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'verification_codes'
      AND indexname = 'verification_codes_auth_user_id_idx'
  ),
  'the Auth-user foreign key has a supporting index'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.check_user_exists(text)', 'execute'),
  'anon cannot enumerate accounts through check_user_exists'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.check_user_exists(text)', 'execute'),
  'authenticated cannot enumerate accounts through check_user_exists'
);

SELECT ok(
  has_function_privilege('service_role', 'public.check_user_exists(text)', 'execute'),
  'service_role can check exact canonical identities'
);

SELECT ok(
  position(
    'where email = email_input'
    IN lower(pg_get_functiondef('public.check_user_exists(text)'::regprocedure))
  ) > 0
  AND position(
    'lower('
    IN lower(pg_get_functiondef('public.check_user_exists(text)'::regprocedure))
  ) = 0,
  'check_user_exists compares the canonical identity exactly without a second normalizer'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.get_auth_user_id_by_canonical_email(text)', 'execute'),
  'anon cannot resolve Auth user IDs'
);

SELECT ok(
  has_function_privilege('service_role', 'public.get_auth_user_id_by_canonical_email(text)', 'execute'),
  'service_role can resolve Auth user IDs'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.get_auth_user_id_by_canonical_email(text)', 'execute'),
  'authenticated users cannot resolve Auth user IDs'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.purge_expired_verification_codes()', 'execute'),
  'anon cannot run credential cleanup'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.purge_expired_verification_codes()', 'execute'),
  'authenticated users cannot run credential cleanup'
);

SELECT ok(
  NOT has_function_privilege('service_role', 'public.purge_expired_verification_codes()', 'execute'),
  'service_role cannot invoke the scheduler-only credential cleanup function'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.consume_email_otp(uuid,text,text,text,text,text,timestamp with time zone)',
    'execute'
  ),
  'anon cannot consume email OTP credentials'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.consume_email_otp(uuid,text,text,text,text,text,timestamp with time zone)',
    'execute'
  ),
  'authenticated users cannot consume email OTP credentials'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.consume_email_otp(uuid,text,text,text,text,text,timestamp with time zone)',
    'execute'
  ),
  'service_role can atomically consume email OTP credentials'
);

SELECT lives_ok(
  $$
    INSERT INTO public.verification_codes (
      email, recipient_email, type, expires_at, code_hash, code_salt, code_version
    ) VALUES (
      'task3identity@gmail.com',
      'Task3.Identity+delivery@Gmail.com',
      'signup',
      now() + interval '10 minutes',
      'task3-signup-hash',
      'task3-signup-salt',
      'otp_hmac_sha256_v1'
    )
  $$,
  'a canonical OTP record with a distinct recipient is accepted'
);

SELECT throws_ok(
  $$
    INSERT INTO public.verification_codes (
      email, recipient_email, type, expires_at, code_hash, code_salt, code_version
    ) VALUES (
      'task3identity@gmail.com',
      'Task3.Identity+retry@Gmail.com',
      'signup',
      now() + interval '10 minutes',
      'task3-signup-second-hash',
      'task3-signup-second-salt',
      'otp_hmac_sha256_v1'
    )
  $$,
  '23505',
  NULL,
  'only one current OTP record exists for each canonical email and type'
);

SELECT throws_ok(
  $$
    INSERT INTO public.verification_codes (
      email, recipient_email, type, expires_at, code_hash, code_salt, code_version
    ) VALUES (
      'Task3.Identity@gmail.com',
      'Task3.Identity@gmail.com',
      'login_mfa',
      now() + interval '10 minutes',
      'task3-noncanonical-hash',
      'task3-noncanonical-salt',
      'otp_hmac_sha256_v1'
    )
  $$,
  '23514',
  NULL,
  'canonical email records must be case-folded'
);

SELECT throws_ok(
  $$
    INSERT INTO public.verification_codes (
      email, recipient_email, type, expires_at, code_hash, code_version
    ) VALUES (
      'task3.reset@gmail.com',
      'Task3.Reset@gmail.com',
      'reset_token',
      now() + interval '10 minutes',
      'task3-reset-hash',
      'reset_hmac_sha256_v1'
    )
  $$,
  '23514',
  NULL,
  'a reset token cannot exist without an Auth user binding'
);

SELECT lives_ok(
  $$
    INSERT INTO public.verification_codes (
      email, recipient_email, type, expires_at, code_hash, code_salt, code_version
    ) VALUES (
      'task3atomic@gmail.com',
      'Task3.Atomic@gmail.com',
      'signup',
      now() + interval '10 minutes',
      'task3-atomic-success-hash',
      'task3-atomic-success-salt',
      'otp_hmac_sha256_v1'
    )
  $$,
  'an email OTP fixture for atomic consumption is accepted'
);

SELECT is(
  public.consume_email_otp(
    (SELECT id FROM public.verification_codes WHERE email = 'task3atomic@gmail.com' AND type = 'signup'),
    'task3atomic@gmail.com',
    'signup',
    'task3-atomic-success-hash',
    'task3-atomic-success-salt',
    'otp_hmac_sha256_v1',
    (SELECT expires_at FROM public.verification_codes WHERE email = 'task3atomic@gmail.com' AND type = 'signup')
  ),
  true,
  'the exact live email OTP generation is consumed'
);

SELECT ok(
  (SELECT consumed_at IS NOT NULL FROM public.verification_codes WHERE email = 'task3atomic@gmail.com' AND type = 'signup'),
  'atomic consumption marks the credential as consumed'
);

SELECT is(
  public.consume_email_otp(
    (SELECT id FROM public.verification_codes WHERE email = 'task3atomic@gmail.com' AND type = 'signup'),
    'task3atomic@gmail.com',
    'signup',
    'task3-atomic-success-hash',
    'task3-atomic-success-salt',
    'otp_hmac_sha256_v1',
    (SELECT expires_at FROM public.verification_codes WHERE email = 'task3atomic@gmail.com' AND type = 'signup')
  ),
  false,
  'a consumed email OTP generation cannot be consumed twice'
);

SELECT lives_ok(
  $$
    INSERT INTO public.verification_codes (
      email, recipient_email, type, expires_at, code_hash, code_salt, code_version
    ) VALUES (
      'task3replacement@gmail.com',
      'Task3.Replacement@gmail.com',
      'login_mfa',
      '2099-01-01T00:00:00.000Z',
      'task3-replacement-hash-a',
      'task3-replacement-salt-a',
      'otp_hmac_sha256_v1'
    )
  $$,
  'an email OTP fixture for resend replacement is accepted'
);

UPDATE public.verification_codes
SET code_hash = 'task3-replacement-hash-b',
    code_salt = 'task3-replacement-salt-b',
    expires_at = '2099-01-01T00:10:00.000Z',
    consumed_at = NULL
WHERE email = 'task3replacement@gmail.com'
  AND type = 'login_mfa';

SELECT is(
  public.consume_email_otp(
    (SELECT id FROM public.verification_codes WHERE email = 'task3replacement@gmail.com' AND type = 'login_mfa'),
    'task3replacement@gmail.com',
    'login_mfa',
    'task3-replacement-hash-a',
    'task3-replacement-salt-a',
    'otp_hmac_sha256_v1',
    '2099-01-01T00:00:00.000Z'
  ),
  false,
  'a stale verification snapshot cannot consume a resend replacement'
);

SELECT ok(
  (
    SELECT code_hash = 'task3-replacement-hash-b'
      AND code_salt = 'task3-replacement-salt-b'
      AND consumed_at IS NULL
    FROM public.verification_codes
    WHERE email = 'task3replacement@gmail.com'
      AND type = 'login_mfa'
  ),
  'the resend replacement remains intact and unconsumed'
);

SELECT lives_ok(
  $$
    INSERT INTO public.verification_codes (
      email, recipient_email, type, expires_at, code_hash, code_salt, code_version
    ) VALUES (
      'task3expired@gmail.com',
      'Task3.Expired@gmail.com',
      'forgot_password',
      now() - interval '1 second',
      'task3-expired-hash',
      'task3-expired-salt',
      'otp_hmac_sha256_v1'
    )
  $$,
  'an expired email OTP fixture is accepted for consumption testing'
);

SELECT is(
  public.consume_email_otp(
    (SELECT id FROM public.verification_codes WHERE email = 'task3expired@gmail.com' AND type = 'forgot_password'),
    'task3expired@gmail.com',
    'forgot_password',
    'task3-expired-hash',
    'task3-expired-salt',
    'otp_hmac_sha256_v1',
    (SELECT expires_at FROM public.verification_codes WHERE email = 'task3expired@gmail.com' AND type = 'forgot_password')
  ),
  false,
  'database-time expiry prevents consuming an expired email OTP'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'sync_auth_user_phone_identity'
      AND tgrelid = 'auth.users'::regclass
      AND NOT tgisinternal
  ),
  'the existing phone identity synchronization trigger remains installed'
);

SELECT ok(
  position(
    'nullif(new.email, '''')'
    IN lower(pg_get_functiondef('public.sync_auth_user_phone_identity()'::regprocedure))
  ) > 0,
  'phone identity projection copies canonical Auth email without a second normalizer'
);

SELECT ok(
  position(
    'lower(trim(new.email))'
    IN lower(pg_get_functiondef('public.sync_auth_user_phone_identity()'::regprocedure))
  ) = 0,
  'phone identity projection no longer lower-trims email independently'
);

SELECT * FROM finish();

ROLLBACK;
