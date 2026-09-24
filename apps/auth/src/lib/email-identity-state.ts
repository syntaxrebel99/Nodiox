import { isCanonicalEmailIdentity, normalizeEmail } from "./normalize-email.ts"

export type SignupEmailVerificationRecordV1 = Readonly<{
  version: 1
  canonicalEmail: string
  recipientEmail: string
  issuedAt: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isTrimmedEmail(value: unknown): value is string {
  if (!isNonEmptyString(value) || value !== value.trim()) return false
  const atIndex = value.indexOf("@")
  return atIndex > 0 && atIndex === value.lastIndexOf("@") && atIndex < value.length - 1
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]) {
  const keys = Object.keys(value)
  return keys.length === expected.length && expected.every((key) => key in value)
}

/**
 * Parses the only supported signup email verification record. Redis clients
 * may return either the object written by Upstash or its JSON representation;
 * both are accepted, while legacy raw-email strings and unversioned objects
 * are deliberately rejected.
 */
export function parseSignupEmailVerificationRecord(
  input: unknown
): SignupEmailVerificationRecordV1 | null {
  let value = input

  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }

  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["version", "canonicalEmail", "recipientEmail", "issuedAt"]) ||
    value.version !== 1 ||
    !isTrimmedEmail(value.canonicalEmail) ||
    !isTrimmedEmail(value.recipientEmail) ||
    !isNonEmptyString(value.issuedAt) ||
    !Number.isFinite(Date.parse(value.issuedAt)) ||
    !isCanonicalEmailIdentity(value.canonicalEmail) ||
    normalizeEmail(value.recipientEmail) !== value.canonicalEmail
  ) {
    return null
  }

  return value as SignupEmailVerificationRecordV1
}

export function createSignupEmailVerificationRecord(
  canonicalEmail: string,
  recipientEmail: string
): SignupEmailVerificationRecordV1 {
  const normalizedCanonicalEmail = normalizeEmail(canonicalEmail)
  const record = {
    version: 1,
    canonicalEmail,
    recipientEmail,
    issuedAt: new Date().toISOString(),
  } as const

  if (
    !isCanonicalEmailIdentity(canonicalEmail) ||
    normalizedCanonicalEmail !== canonicalEmail ||
    !parseSignupEmailVerificationRecord(record)
  ) {
    throw new Error("Signup record requires one valid canonical and recipient email pair")
  }

  return record
}
