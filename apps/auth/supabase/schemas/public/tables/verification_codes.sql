CREATE TABLE "public"."verification_codes" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "email"           text                     NOT NULL,
  "recipient_email" text                     NOT NULL,
  "type"            text                     NOT NULL,
  "expires_at"      timestamp with time zone NOT NULL,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "code_hash"       text,
  "code_salt"       text,
  "code_version"    text,
  "consumed_at"     timestamp with time zone,
  "attempt_count"   integer                  NOT NULL DEFAULT 0,
  "last_attempt_at" timestamp with time zone,
  "auth_user_id"    uuid,
  CONSTRAINT "verification_codes_pkey" PRIMARY KEY (id),
  CONSTRAINT "verification_codes_auth_user_id_fkey"
    FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "verification_codes_email_canonical_shape_check"
    CHECK (email = btrim(email) AND email = lower(email) AND length(email) > 3),
  CONSTRAINT "verification_codes_recipient_email_check"
    CHECK (recipient_email = btrim(recipient_email) AND length(recipient_email) > 3),
  CONSTRAINT "verification_codes_record_shape_check"
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
    ),
  CONSTRAINT "verification_codes_email_type_key" UNIQUE (email, type)
);

ALTER TABLE "public"."verification_codes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX verification_codes_expires_at_idx ON public.verification_codes USING btree (expires_at);

CREATE INDEX verification_codes_auth_user_id_idx
  ON public.verification_codes USING btree (auth_user_id)
  WHERE (auth_user_id IS NOT NULL);

CREATE UNIQUE INDEX verification_codes_type_code_hash_key
  ON public.verification_codes USING btree (type, code_hash)
  WHERE (code_hash IS NOT NULL);

REVOKE ALL ON TABLE "public"."verification_codes" FROM PUBLIC, "anon", "authenticated", "service_role";

GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE "public"."verification_codes" TO "service_role";
