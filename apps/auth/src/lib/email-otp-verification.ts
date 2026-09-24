import { timingSafeEqual } from "node:crypto"

import {
  getEmailOtpAttemptKey,
  type EmailOtpAttemptGeneration,
  type EmailOtpType,
} from "./email-otp-attempt-key.ts"
import { isCanonicalEmailIdentity } from "./normalize-email.ts"

export type EmailOtpVerificationRecord = Readonly<{
  id: string
  email: string
  type: EmailOtpType
  expiresAt: string
  codeHash: string | null
  codeSalt: string | null
  codeVersion: string | null
  consumedAt: string | null
}>

export type EmailOtpVerificationFailureReason =
  | "already_consumed"
  | "credential_changed_or_consumed"
  | "expired"
  | "hash_mismatch"
  | "invalid_format"
  | "missing_code_record"
  | "too_many_attempts"
  | "unsupported_code_version"

export type EmailOtpVerificationStore = {
  read: (
    email: string,
    type: EmailOtpType,
  ) => Promise<{ error: unknown | null; record: EmailOtpVerificationRecord | null }>
  consumeExact: (
    record: EmailOtpVerificationRecord,
  ) => Promise<{ consumed: boolean; error: unknown | null }>
}

export type EmailOtpAttemptStore = {
  del: (key: string) => Promise<unknown>
  expire: (key: string, seconds: number) => Promise<unknown>
  incr: (key: string) => Promise<number>
}

export type VerifyEmailOtpDependencies = Readonly<{
  attempts: EmailOtpAttemptStore
  hashOtp: (code: string, saltB64: string) => string
  now?: () => Date
  reportFailure?: (reason: EmailOtpVerificationFailureReason) => void
  store: EmailOtpVerificationStore
}>

export type EmailOtpVerificationResult = {
  success: boolean
  error?: string
}

const GENERIC_OTP_ERROR = "Invalid or expired verification code"
const OTP_ATTEMPT_TTL_SECONDS = 60 * 15
const OTP_HMAC_VERSION = "otp_hmac_sha256_v1"

function isExpired(expiresAt: string, now: Date) {
  const timestamp = new Date(expiresAt).getTime()
  return !Number.isFinite(timestamp) || timestamp <= now.getTime()
}

function hasSupportedCredential(
  record: EmailOtpVerificationRecord,
): record is EmailOtpVerificationRecord & {
  codeHash: string
  codeSalt: string
  codeVersion: typeof OTP_HMAC_VERSION
} {
  return (
    record.codeVersion === OTP_HMAC_VERSION &&
    Boolean(record.codeHash) &&
    Boolean(record.codeSalt)
  )
}

function createAttemptGeneration(record: EmailOtpVerificationRecord & {
  codeHash: string
  codeSalt: string
  codeVersion: typeof OTP_HMAC_VERSION
}): EmailOtpAttemptGeneration {
  return {
    id: record.id,
    codeHash: record.codeHash,
    codeSalt: record.codeSalt,
    codeVersion: record.codeVersion,
    expiresAt: record.expiresAt,
  }
}

function hashesMatch(storedHash: string, expectedHash: string) {
  const stored = Buffer.from(storedHash)
  const expected = Buffer.from(expectedHash)
  return stored.length === expected.length && timingSafeEqual(stored, expected)
}

/**
 * Verifies an email OTP against an injected persistence adapter. The adapter
 * must conditionally consume the exact snapshot it receives in one database
 * mutation. Keeping this flow dependency-injected makes interleavings
 * deterministic in unit tests without weakening the production path.
 */
export async function verifyEmailOtp(
  email: string,
  code: string,
  type: EmailOtpType,
  dependencies: VerifyEmailOtpDependencies,
): Promise<EmailOtpVerificationResult> {
  const now = dependencies.now ?? (() => new Date())
  const fail = (reason: EmailOtpVerificationFailureReason) => {
    dependencies.reportFailure?.(reason)
    return { success: false, error: GENERIC_OTP_ERROR }
  }

  if (!isCanonicalEmailIdentity(email)) {
    return fail("missing_code_record")
  }

  const { record, error: readError } = await dependencies.store.read(email, type)
  if (readError || !record) {
    return fail("missing_code_record")
  }

  if (record.consumedAt) {
    return fail("already_consumed")
  }

  if (isExpired(record.expiresAt, now())) {
    // Expired rows are retained for the scheduled purge. A verifier must not
    // delete an in-place resend replacement based on a stale snapshot.
    return fail("expired")
  }

  if (!hasSupportedCredential(record)) {
    // The policy migration only permits the supported record shape. If an
    // unexpected row exists, reject it without deleting a possible resend.
    return fail("unsupported_code_version")
  }

  if (!/^\d{6}$/.test(code)) {
    return fail("invalid_format")
  }

  const attemptsKey = getEmailOtpAttemptKey(email, type, createAttemptGeneration(record))
  const attempts = await dependencies.attempts.incr(attemptsKey)
  if (attempts === 1) {
    await dependencies.attempts.expire(attemptsKey, OTP_ATTEMPT_TTL_SECONDS)
  }

  if (attempts >= 5) {
    // The generation-specific Redis lock remains until expiry. Do not delete
    // the database row: a resend can have replaced this snapshot in place.
    return fail("too_many_attempts")
  }

  const expectedHash = dependencies.hashOtp(code, record.codeSalt)
  if (!hashesMatch(record.codeHash, expectedHash)) {
    return fail("hash_mismatch")
  }

  const { consumed, error: consumeError } = await dependencies.store.consumeExact(record)
  if (consumeError || !consumed) {
    return fail("credential_changed_or_consumed")
  }

  await dependencies.attempts.del(attemptsKey)
  return { success: true }
}
