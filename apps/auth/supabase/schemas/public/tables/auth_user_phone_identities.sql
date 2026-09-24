CREATE TABLE "public"."auth_user_phone_identities" (
  "user_id"     uuid                     NOT NULL,
  "phone"       text                     NOT NULL,
  "email"       text,
  "is_verified" boolean                  NOT NULL DEFAULT false,
  "created_at"  timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT timezone('utc'::text, now()),
  CONSTRAINT "auth_user_phone_identities_phone_length" CHECK ((char_length(phone) >= 8)),
  CONSTRAINT "auth_user_phone_identities_phone_trimmed" CHECK ((phone = TRIM(BOTH FROM phone))),
  CONSTRAINT "auth_user_phone_identities_pkey" PRIMARY KEY (user_id),
  CONSTRAINT "auth_user_phone_identities_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."auth_user_phone_identities"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX auth_user_phone_identities_email_idx ON public.auth_user_phone_identities USING btree (email)
  WHERE (email IS NOT NULL);

CREATE UNIQUE INDEX auth_user_phone_identities_phone_idx ON public.auth_user_phone_identities USING btree (phone);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."auth_user_phone_identities" TO "postgres", "service_role";
