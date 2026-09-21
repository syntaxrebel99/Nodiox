# Nodiox Auth App — Security Audit

> **Scope:** `apps/auth` (Next.js 16.2, Supabase Auth, Upstash Redis, Resend, Infobip)
> **Date:** September 2026
> **Type:** Static review — no production traffic or live penetration testing
> **Sources:** Two independent audits merged and reconciled

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Strengths](#strengths)
- [Findings](#findings)
  - [Critical](#critical)
  - [High](#high)
  - [Medium](#medium)
  - [Low](#low)
- [Tooling & Test Health](#tooling--test-health)
- [Remediation Roadmap](#remediation-roadmap)

---

## Architecture Overview

The auth app runs as a dedicated origin on port 3001. It handles email-primary identity through Supabase GoTrue, with phone identity stored as `user_metadata` and delivered via Infobip OTP. After successful authentication (including MFA), the browser is redirected to the dashboard origin.

**Pages:** Localized login, signup (7-step with draft persistence), forgot-password, password-reset.

**API routes:** `login`, `send-otp`, `verify-otp`, `set-password`, `forgot-password/send-otp`, `forgot-password/verify-otp`, `reset-password/complete`, `health`, `csp-report`.

**Key dependencies:** `next@16.2.1`, `@supabase/supabase-js@2.101.1`, `@upstash/ratelimit`, `next-intl@4.8.3`, `resend`, `@sentry/nextjs`.

---

## Strengths

The auth app has a genuinely strong security foundation. These are not decorative — they represent real, well-implemented defense in depth:

| Area | Detail |
|---|---|
| **CSRF protection** | Every mutating route validates Origin + double-submit token with timing-safe comparison and JSON content-type enforcement |
| **Rate limiting** | Tri-layer Upstash limits (IP, hashed identifier, composite) + global 100/min cap + progressive tarpit + Gmail dot/plus folding on limiter keys |
| **OTP hashing** | HMAC-SHA256 with pepper + per-code salt, generic failure strings, 5-attempt invalidation, 10-minute TTL, delete-on-success |
| **Browser hardening** | Per-request CSP nonce + `strict-dynamic` in production, `frame-ancestors none`, COOP/CORP, HSTS preload, Permissions-Policy, CSP reporting with size/rate caps |
| **Environment validation** | Zod-validated env at boot; production refuses a short `OTP_PEPPER` or incomplete Infobip config |
| **Credential isolation** | Service-role client is server-only and session-less; browser clients use the anon key; stateless login client avoids cookie writes before MFA |
| **Privacy** | Opaque signup/reset cookies (address stored only in Redis); Sentry configured with `sendDefaultPii: false`; passwords excluded from browser draft storage |
| **UX** | Localized RTL emails, password-changed and signup-attempt alerts, welcome mail after `createUser`, dashboard handoff via `NEXT_PUBLIC_DASHBOARD_URL`, phone region locked to DZ E.164 |

---

## Findings

### Critical

---

#### CRIT-1 · Next.js Has Known Critical Vulnerabilities

**Affected:** `apps/auth/package.json`, `apps/dashboard/package.json`, `apps/storefront/package.json`

**Problem:** `next@16.2.1` carries 2 critical and 32 high-severity advisories in the production dependency tree, including remote code execution vectors. `next-intl@4.8.3` also has known vulnerabilities (the configured `always` locale mode may make one advisory unreachable, but the exposure is still unacceptable).

**Risk:** Framework-level RCE means no amount of application-level auth hardening matters if the framework underneath is compromised. This is the highest-priority finding.

**Fix:**
1. Upgrade `next` to the latest patched 16.x release across all workspace apps (at minimum `16.3.3`, ideally latest)
2. Upgrade `eslint-config-next` to the matching version
3. Upgrade `next-intl` to `>=4.9.2`
4. Regenerate `pnpm-lock.yaml`
5. Run `pnpm audit` — success means zero critical advisories remain
6. Build and smoke-test each app: localized routes, CSP nonce behavior, Supabase cookie/session, Sentry client connectivity
7. Commit as an isolated "security dependency upgrade" for clean rollback

---

#### CRIT-2 · Dashboard Has No Authorization

**Affected:** `apps/dashboard/src/proxy.ts`, `apps/dashboard/src/app/[locale]/(dashboard)/app/page.tsx`

**Problem:** The auth app redirects to the dashboard after login, but the dashboard itself has no session check — only locale-routing middleware. The dashboard is publicly reachable today.

**Risk:** Once the dashboard has tenant data or mutations, any unauthenticated user can access them. This is an open boundary.

**Fix:**
1. Add Supabase session verification in the dashboard middleware/proxy — redirect to the auth app login if no valid session exists
2. Protect all dashboard API routes with session checks
3. Align cross-app cookie/session behavior so the auth-issued session is readable by the dashboard origin

---

#### CRIT-3 · Pre-MFA Session Tokens Stored in Redis

**Affected:** `apps/auth/src/lib/pending-login.ts` (lines 10–17), `apps/auth/src/app/api/auth/login/route.ts`, `apps/auth/src/app/api/auth/verify-otp/route.ts`

**Problem:** Password login calls `signInWithPassword`, then `issuePendingLoginChallenge` writes both `accessToken` and `refreshToken` into Redis under a hashed cookie key. These tokens remain live for 15 minutes while the user completes MFA. Anyone who can read Redis has usable session credentials — MFA becomes a gate on cookie delivery, not on credential minting.

**Risk:** Redis compromise = account takeover without the second factor. The challenge cookie alone is not sufficient (the attacker still needs the OTP), but the Redis exposure bypasses MFA entirely.

**Fix:**
1. **Do not store GoTrue tokens in Redis.** Store only an opaque challenge: `{ userId, method: 'email' | 'phone', identifier, expiresAt }`
2. After OTP verification succeeds, mint the session server-side using a freshly generated server-only magic-link exchange, then set cookies
3. **Do not use `admin.auth.admin.createSession(userId)`** — this API is not exposed in the installed `@supabase/supabase-js@2.101.1` public types. Verify SDK support before building around it
4. Supabase AAL2/native MFA is the right long-term direction but impractical short-term — phone identity lives in `user_metadata` with Infobip, not in GoTrue's native phone field

---

#### CRIT-4 · Password Reset Grants a Full Session Before Password Change

**Affected:** `apps/auth/src/app/api/auth/forgot-password/verify-otp/route.ts`, `apps/auth/src/app/api/auth/reset-password/complete/route.ts`, `apps/auth/src/app/(pages)/[locale]/password-reset/page.tsx`

**Problem:** The forgot-password OTP verification flow uses `admin.generateLink(magiclink)` + `verifyOtp` to set auth cookies — granting a full session before the password is actually changed. Additionally:
- `password-reset/page.tsx` accepts any `getSession()` if the reset cookie is missing
- `reset-password/complete` updates the password whenever `getUser()` succeeds, even without a reset token
- The reset `code` field is `z.string().optional()` in the schema

This means a stolen normal session can change any account's password through the reset endpoint with no current-password check.

**Risk:** Email OTP becomes account takeover — the attacker has a live session that can outlive the 10-minute reset cookie. An existing session can also be used to change the password without any recovery proof.

**Fix:**
1. **Remove the `generateLink` + `verifyOtp` session bridge** from the forgot-password verify route — do not create a usable session during reset
2. **Require an effective reset credential** — either the HTTP-only reset cookie or a verified code. Do not make `code` literally required in the Zod schema (that would break the cookie flow), but reject the request if neither credential is present
3. **Remove the `getSession()` fallback** as authorization in the reset page
4. Verify the reset token against `verification_codes` *before* calling `getUser()`, not as an optional gate
5. Update the password through a server-admin path, consume the credential, then either redirect to login or create a fresh session *after* the new password is set
6. **Create a separate "change password" endpoint** for authenticated users that requires the current password

---

### High

---

#### HIGH-1 · Phone Login Scans Every Auth User

**Affected:** `apps/auth/src/lib/auth-user-lookup.ts` (line 24)

**Problem:** `findAuthUserByPhone` paginates through `admin.auth.admin.listUsers` (200 per page) until it finds a metadata phone match. Login awaits this before `signInWithPassword`.

**Risk:** Latency and cost grow linearly with user count. A burst of phone logins is a service-role DoS. The early-return vs full-scan timing difference is an oracle for whether a phone number exists.

**Fix:**
1. Create a `profiles` or identity-mapping table with `phone_normalized TEXT UNIQUE` and an index
2. Write a Supabase Database Webhook or direct insert in the `set-password` signup route to keep it in sync
3. Query via a narrowly-scoped RPC behind service-role only — do not expose to the anon key
4. **Write a backfill migration for existing users** — without this, old phone logins break the day you ship

---

#### HIGH-2 · Raw Provider and Exception Messages Returned to Clients

**Affected:** `apps/auth/src/app/api/auth/login/route.ts` (MFA catch), `apps/auth/src/app/api/auth/set-password/route.ts`, `apps/auth/src/app/api/auth/forgot-password/verify-otp/route.ts`, `apps/auth/src/app/api/health/route.ts`, `apps/auth/src/lib/email-service.ts`

**Problem:** Multiple handlers return `error.message`, `createError.message`, or `finalError.message` directly to the client. This leaks whether an email is registered, GoTrue internal states, or infrastructure details — undermining the generic "Invalid credentials" work done elsewhere.

**Risk:** Information disclosure that aids targeted attacks. Inconsistent with the otherwise careful anti-enumeration design.

**Fix:**
1. Replace all raw error returns with `respondError(req, statusCode, "stable public string")` — the infrastructure already exists in `security-response.ts`
2. Map known Supabase error codes (`email_exists`, `weak_password`, etc.) to i18n keys
3. Log only hashed identifiers via `securityLog()` + `hashIdentifier()`
4. Do not assume `respondError()` sanitizes arbitrary fields — verify it doesn't forward raw data into Sentry extras

**Effort:** ~30 minutes. One of the cheapest and most impactful fixes.

---

#### HIGH-3 · OTP Table and Functions Not Under Version Control

**Affected:** `apps/auth/supabase/migrations/`, `tmp/supabase_verification_codes_upgrade.sql`

**Problem:** The auth app's migrations only ship `20260408_cleanup_job.sql`. The hash columns, indexes, `consumed_at`, `attempt_count`, and the `check_user_exists` function live in `tmp/supabase_verification_codes_upgrade.sql` or have no in-repo definition at all. RLS policies are undefined.

**Risk:** Environments diverge. If RLS is off or the anon key can read `verification_codes`, hashed OTPs and reset tokens are exposed. New environments or developer machines will fail silently on signup if `check_user_exists` doesn't exist. Cleanup and uniqueness are not guaranteed.

**Fix:**
1. Move into versioned migrations: full table DDL, hash/version columns, `check_user_exists` RPC, RLS policies (service-role only), grants, indexes, cleanup job
2. Add a partial unique constraint: one unconsumed `(email, type)` record
3. Delete `tmp/` scripts or mark them as generated artifacts
4. Test the migration path itself — verify a fresh environment can run all migrations and have a working auth flow

---

#### HIGH-4 · Infobip SMS Provider May Use Plaintext HTTP

**Affected:** `apps/auth/src/lib/sms-service.ts` (line 51)

**Problem:** `INFOBIP_BASE_URL` accepts `http://` URLs. The code sends the Infobip API key and OTP payload to that URL.

**Risk:** If misconfigured, API keys and OTP codes transit in cleartext.

**Fix:**
1. Add HTTPS enforcement in the Zod env validation: reject any `INFOBIP_BASE_URL` that doesn't start with `https://`
2. Optionally restrict the host to known Infobip domains

---

### Medium

---

#### MED-1 · OTP Consume Is Not Atomic (Race Condition)

**Affected:** `apps/auth/src/lib/email-service.ts` (line 248), `apps/auth/src/lib/sms-service.ts`

**Problem:** Both email and SMS OTP verification follow a check-then-delete pattern: increment Redis attempts → SELECT/GET the record → compare HMAC → DELETE. Two parallel requests can both pass the comparison before either deletes.

**Risk:** A 6-digit code (~19.8 bits) can be used twice in a race window, including for login MFA and password reset.

**Fix — Email OTPs (PostgreSQL):**
Use a single atomic SQL operation:
```sql
UPDATE verification_codes
SET consumed_at = NOW()
WHERE id = $1
  AND code_hash = $2
  AND expires_at > NOW()
  AND consumed_at IS NULL
RETURNING *;
```
This requires adding `consumed_at` to the schema (ties into HIGH-3).

**Fix — SMS OTPs (Redis):**
Do **not** use bare `GETDEL` — it would consume a valid OTP even when the user types the wrong code. Use a Redis Lua script for atomic state transition: check expiry → increment attempts → compare expected hash → delete only on match or lockout.

---

#### MED-2 · OTP Resend Clears Wrong Redis Attempt Key

**Affected:** `apps/auth/src/lib/email-service.ts` (line 173 vs line 252)

**Problem:** The email OTP resend path clears a different Redis key than the one verification checks. A resend does not actually reset the attempt counter as the code comment claims.

**Risk:** Users can get locked out despite receiving a fresh code, creating avoidable support burden and UX friction.

**Fix:** Use the same Redis key construction for both send and verify paths. Audit all key-generation helpers to ensure consistency.

---

#### MED-3 · CSRF Cookie Options Diverge Between Middleware and Rotation

**Affected:** `apps/auth/src/proxy.ts` (line 82), `apps/auth/src/lib/csrf.ts` (line 131)

**Problem:** `proxy.ts` sets `nodiox_csrf_token` without `COOKIE_DOMAIN`. `rotateCsrfToken()` sets domain from `COOKIE_DOMAIN`. The matcher excludes `/api`, so the cookie is only minted on document navigations. After login/signup rotation, the browser may keep two cookies or drop the token when the auth host and parent domain differ.

**Risk:** Inconsistent CSRF behavior in subdomain deployments. API-only clients never receive a CSRF cookie.

**Fix:**
1. Create a single cookie-options helper used by proxy, rotation, and tests
2. Include `Domain`, `Secure`, `SameSite`, `Path`, `Max-Age` in every call
3. Decide explicitly between host-only cookies (`__Host-` prefix, preferred for an auth-only origin) and a validated parent-domain SSO strategy — do not mix both
4. Decide whether API routes should mint the cookie

---

#### MED-4 · Origin Check Consults Untrusted X-Forwarded-Proto

**Affected:** `apps/auth/src/lib/csrf.ts`

**Problem:** The code comments that forwarded headers are untrusted, then uses `expectedProto = forwardedProto ?? (prod ? 'https' : request.protocol)`. A client that spoofs the proto can force an origin mismatch (availability issue). Behind a non-Vercel proxy the host/proto story is fragile.

**Risk:** Availability disruption, not a bypass (assuming Origin is honest). But fragile in non-standard deployments.

**Fix:** In production, compare Origin against a configured canonical public origin (e.g. `https://${SITE_URL.host}`). Ignore client-controlled forwarding headers unless the deployment platform guarantees sanitization.

---

#### MED-5 · CSP Blocks Sentry Browser SDK

**Affected:** `apps/auth/src/proxy.ts` (line 33), `instrumentation-client.ts`

**Problem:** `connect-src` is `'self' https://*.supabase.co`. The Sentry browser SDK needs to reach its ingest host, which is not allowlisted. `img-src` allows `fonts.gstatic.com` but not Sentry ingest.

**Risk:** Client-side errors from login/signup never reach Sentry in production, while the server SDK still reports. This creates a false sense of frontend error coverage.

**Fix:** Add the Sentry ingest host (derived from the configured DSN) to `connect-src`. Alternatively, use a same-origin Sentry tunnel and keep `connect-src 'self'`. Keep nonce + `strict-dynamic`.

---

#### MED-6 · Phone Signup Allows SMS Cost Abuse

**Affected:** `apps/auth/src/app/api/auth/send-otp/route.ts` (line 90)

**Problem:** `send-otp` checks `check_user_exists` only for email. Phone always calls `SmsService.sendOtp`. Infobip retries via `withRetry` (up to 3 extra sends on failure). The email path is anti-enumeration (existing users get a security alert, not an OTP), but phone is not.

**Risk:** SMS cost abuse against arbitrary DZ numbers. Delivery-vs-error responses are a side channel for whether a number is in a bad state.

**Fix:**
1. Return the same generic 200 for phone regardless of account status
2. If the number is already registered, skip SMS or send a security notice instead
3. Cap provider retries; use idempotency keys where Infobip supports them
4. Add per-IP, per-phone, and tenant-wide SMS cost quotas
5. Add constant-time dummy work on the "ghost" path to prevent timing oracles

---

#### MED-7 · API Can Create an Account Without a Verified Phone

**Affected:** `apps/auth/src/app/api/auth/set-password/route.ts`

**Problem:** `set-password` treats phone as optional. The phone cookie is consumed only if phone is present. The onboarding schema also marks `phoneNumber` as optional. But the 7-step signup UI implies phone is required, and product MFA (SMS login) depends on having a phone.

**Risk:** Direct API callers can bypass phone verification. SMS-based MFA then fails or falls back inconsistently.

**Fix:** If phone is a product requirement, reject `set-password` without a consumed signup phone token. Keep UI and API on one policy. If phone is truly optional, make the UI reflect that and handle the MFA fallback gracefully.

---

#### MED-8 · Gmail Canonicalization Disagrees Between Login Limits and Account Keys

**Affected:** `apps/auth/src/lib/normalize-email.ts` (lines 18–26), `apps/auth/src/lib/rate-limit.ts`

**Problem:** `normalizeEmail()` keeps `@googlemail.com` as-is (normalizes dots/plus but returns `normalizedLocal@googlemail.com`). The rate limiter maps `googlemail.com → gmail.com`. This means two accounts can exist for the same physical mailbox while sharing one rate-limit bucket, or login can miss the stored identity.

**Risk:** Duplicate accounts, rate-limit bypass, or login failures for googlemail.com users.

**Fix — one-liner in `normalize-email.ts`:**
```ts
const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain
return `${normalizedLocal}@${normalizedDomain}`
```
Use this single `normalizeEmail()` for storage, OTP rows, rate limits, and `check_user_exists`. Restrict `+` alias stripping to providers whose mailbox semantics are known (primarily Gmail) — do not strip for all domains. Plan a migration for any existing duplicate identities.

**Effort:** ~5 minutes for the code change + migration planning.

---

#### MED-9 · Unauthenticated Health Endpoint Probes DB and Redis with Service Role

**Affected:** `apps/auth/src/app/api/health/route.ts`

**Problem:** The health route counts `verification_codes` via `createAdminClient` and pings Redis. Failures may return `error.message`. No authentication, no rate limiting.

**Risk:** Reconnaissance of dependency health and a cheap way to generate service-role traffic. Not a data dump, but a privileged probe on the public internet.

**Fix:**
1. Split into liveness (process up, no auth needed) and readiness (dependency checks)
2. Protect readiness with a network allowlist or shared probe secret
3. Add `Cache-Control: no-store`
4. Never return exception text — return generic status codes only

---

#### MED-10 · Server-Side Name Validation Allows XSS in Email Templates

**Affected:** `apps/auth/src/app/api/auth/set-password/route.ts` (line 24), `apps/auth/src/lib/email-service.ts` (line 15)

**Problem:** Server-side signup validation only requires a 2-character `fullName`. The value is persisted and interpolated into a welcome-email HTML template without sanitization.

**Risk:** Stored XSS delivered via email. Email clients vary in HTML handling, but some render injected markup.

**Fix:**
1. Reuse the strict signup schema server-side (not a minimal API schema)
2. Add a reasonable length limit
3. HTML-escape all dynamic values before interpolating into email templates

---

#### MED-11 · Timing Oracle on Account Existence

**Affected:** `apps/auth/src/app/api/auth/forgot-password/send-otp/route.ts` (line 70), `apps/auth/src/app/api/auth/send-otp/route.ts`

**Problem:** Account-existence responses are textually uniform, but password reset exposes a timing oracle: real users incur email-provider work, while nonexistent accounts wait only 400–900ms of dummy delay.

**Risk:** Automated timing analysis can enumerate which email addresses have accounts.

**Fix:**
1. Normalize response time by measuring the real-send duration and padding the ghost path to match
2. Or queue the email send asynchronously and return immediately for all cases
3. Return generic public errors only

---

### Low

---

#### LOW-1 · Welcome Email Links to Wrong Origin

**Affected:** `apps/auth/src/lib/email-service.ts` (line 481)

**Problem:** `sendWelcomeEmail` uses `_getSiteUrl() + '/dashboard'` (which resolves to `NEXT_PUBLIC_SITE_URL`). Successful login/signup uses `NEXT_PUBLIC_DASHBOARD_URL` (default `localhost:3002`). These can be different origins.

**Risk:** New users land on a missing route on the auth origin after clicking the email CTA.

**Fix:** Use `NEXT_PUBLIC_DASHBOARD_URL` (required in production) for all post-auth links, including email CTAs. Do not derive server email links from a generic site URL.

---

#### LOW-2 · Remember Me Checkbox Is Collected and Never Sent

**Affected:** `apps/auth/src/lib/login-schema.ts`, `apps/auth/src/app/api/auth/login/route.ts`

**Problem:** The login schema and step-1 credentials expose `rememberMe`. The login API payload only has `email/phone/password`. Session cookies always use the GoTrue default lifetime.

**Risk:** Users believe they opted into a longer session. Shared-device users keep the default refresh lifetime even when they intended a session-only visit.

**Fix:** Either wire `rememberMe` to cookie `Max-Age` / session-only refresh behavior, or remove the checkbox entirely. A security-related control that does nothing is worse than no control.

---

#### LOW-3 · Password Policy Is Composition-Only; Client and Server Limits Differ

**Affected:** `apps/auth/src/lib/password-schemas.ts`, password validation logic

**Problem:** `validatePasswordPolicy` enforces 8–72 characters, mixed case, digit, special character. But `password-schemas.ts` has no 72-character cap. No breached-password or strength check. `Password123!` passes.

**Risk:** Weak passwords that meet composition rules. Over-72 passwords fail only on the server after bcrypt truncation risk.

**Fix:**
1. Share one schema between client and server with identical limits
2. Add a k-anonymity HIBP check (send only the first 5 chars of the SHA-1 hash — never the password)
3. Reject obviously weak patterns without logging the secret
4. Prefer length + breach screening over composition rules alone

---

#### LOW-4 · PII Masking Is Inconsistent Across Loggers

**Affected:** `apps/auth/src/lib/logger.ts`, `apps/auth/src/lib/email-service.ts` (line 240), `apps/auth/src/lib/sms-service.ts` (line 139)

**Problem:** `logger.ts` masks keys containing `email`/`token`. But `securityLog` and `EmailService` `console.error` still interpolate raw emails on failure. The SMS mock logs plaintext codes and phone numbers. CSP report logs client IPs.

**Risk:** Production log sinks and Sentry extras hold PII (mailbox identifiers, phone numbers) after provider failures.

**Fix:**
1. Route all auth logs through `logger` + `hashIdentifier()`
2. Scrub Sentry extras before capture
3. Reject `AUTH_SMS_PROVIDER=mock` in production so plaintext OTP logs cannot appear in shared environments

---

## Tooling & Test Health

| Issue | Detail | Fix |
|---|---|---|
| **TypeScript fails** | Cannot resolve React types from `@nodiox/utils` | Add the appropriate React type dependency to that workspace package |
| **ESLint fails** | `apps/auth` invokes `eslint` but it's only a dev dep of the shared config package | Make ESLint a direct workspace/app dependency |
| **Browser tests fail** | Chromium not installed locally; 8 browser tests fail before launch, 5 API tests pass | Verify after fixing quality gates; CI does install Chromium |
| **Coverage gaps** | No tests for forgot-password, reset complete, CSRF origin, rate limits, OTP hash verification, or Redis/session invariants | See test recommendations below |

**Test recommendations:**
1. Add unit tests for: `csrf.ts`, `rate-limit.ts`, `EmailService.verifyOtp`, `pending-login.ts`
2. Add contract tests for the reset flow (verify reset credential is required, session is not created before password change)
3. Add one true E2E with `AUTH_SMS_PROVIDER=mock` through the full login → MFA → session flow
4. Test that: no session exists before MFA, exactly one session after MFA, challenge replay is rejected, OTP race is handled, reset requires recovery proof, dashboard denies access without a session

---

## Remediation Roadmap

### Phase 1 — Immediate (this week)

| # | Task | Effort | Findings |
|---|---|---|---|
| 1 | Upgrade Next.js + next-intl, regenerate lockfile, re-audit ✅ | CRIT-1 |
| 2 | Sanitize all error responses to use `respondError()` ✅ | HIGH-2 |
| 3 | Fix Gmail/googlemail normalization | MED-8 |
| 4 | Enforce HTTPS for `INFOBIP_BASE_URL` in env validation | HIGH-4 |
| 5 | HTML-escape `fullName` in email templates | MED-10 |

### Phase 2 — Short-term (next sprint)

| # | Task | Effort | Findings |
|---|---|---|---|
| 6 | Add dashboard session/authorization checks | CRIT-2 |
| 7 | Remove pre-MFA JWTs from Redis; store opaque challenge only | CRIT-3 |
| 8 | Redesign reset flow: no session before password change, require reset credential | CRIT-4 |
| 9 | Version-control OTP schema, RLS, `check_user_exists`, indexes | HIGH-3 |
| 10 | Make OTP consume atomic (SQL for email, Lua for SMS) | MED-1 |
| 11 | Fix OTP resend attempt-key inconsistency | MED-2 |

### Phase 3 — Medium-term

| # | Task | Effort | Findings |
|---|---|---|---|
| 12 | Replace phone O(n) scan with indexed mapping + backfill | HIGH-1 |
| 13 | Unify CSRF cookie helper | MED-3, MED-4 |
| 14 | Fix CSP `connect-src` for Sentry | MED-5 |
| 15 | Add phone anti-enumeration + SMS cost controls | MED-6 |
| 16 | Enforce phone verification policy in API | MED-7 |
| 17 | Normalize timing on account-existence checks | MED-11 |
| 18 | Fix TypeScript/ESLint gates | Tooling |
| 19 | Add unit + integration + E2E test coverage | Tooling |

### Phase 4 — Polish

| # | Task | Effort | Findings |
|---|---|---|---|
| 20 | Fix welcome email URL | LOW-1 |
| 21 | Wire or remove remember-me checkbox | LOW-2 |
| 22 | Unify password schema + add HIBP check | LOW-3 |
| 23 | Route all logs through redacting logger | LOW-4 |
| 24 | Add separate "change password" endpoint with current-password check | CRIT-4 |
| 25 | Protect health readiness behind auth/allowlist | MED-9 |
