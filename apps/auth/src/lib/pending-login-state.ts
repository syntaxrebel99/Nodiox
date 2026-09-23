import { isCanonicalEmailIdentity, normalizeEmail } from "./normalize-email.ts"

export interface PendingLoginChallengeBase {
  version: 1
  accessToken: string
  refreshToken: string
  issuedAt: string
}

export interface PendingEmailLoginChallenge extends PendingLoginChallengeBase {
  method: "email"
  canonicalEmail: string
  recipientEmail: string
}

export interface PendingPhoneLoginChallenge extends PendingLoginChallengeBase {
  method: "phone"
  phone: string
}

export type PendingLoginChallenge =
  | PendingEmailLoginChallenge
  | PendingPhoneLoginChallenge

export type PendingLoginChallengeInput =
  | Omit<PendingEmailLoginChallenge, "issuedAt" | "version">
  | Omit<PendingPhoneLoginChallenge, "issuedAt" | "version">

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expectedKeys: readonly string[]) {
  const keys = Object.keys(value)
  return keys.length === expectedKeys.length && expectedKeys.every((key) => key in value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0
}

function isValidIssuedAt(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value))
}

function isCanonicalEmail(value: unknown): value is string {
  return isCanonicalEmailIdentity(value)
}

function isRecipientEmailForCanonicalIdentity(
  recipientEmail: unknown,
  canonicalEmail: string,
): recipientEmail is string {
  return (
    typeof recipientEmail === "string" &&
    recipientEmail.length > 0 &&
    recipientEmail === recipientEmail.trim() &&
    normalizeEmail(recipientEmail) === canonicalEmail
  )
}

/** Parse only the permanent V1 email-or-phone challenge representation. */
export function parsePendingLoginChallenge(value: unknown): PendingLoginChallenge | null {
  if (!isRecord(value) || value.version !== 1 || !isValidIssuedAt(value.issuedAt)) {
    return null
  }

  if (value.method === "email") {
    if (
      hasExactKeys(value, [
        "version",
        "method",
        "canonicalEmail",
        "recipientEmail",
        "accessToken",
        "refreshToken",
        "issuedAt",
      ]) &&
      isCanonicalEmail(value.canonicalEmail) &&
      isRecipientEmailForCanonicalIdentity(value.recipientEmail, value.canonicalEmail) &&
      isNonEmptyString(value.accessToken) &&
      isNonEmptyString(value.refreshToken)
    ) {
      return value as unknown as PendingEmailLoginChallenge
    }
    return null
  }

  if (value.method === "phone") {
    if (
      hasExactKeys(value, [
        "version",
        "method",
        "phone",
        "accessToken",
        "refreshToken",
        "issuedAt",
      ]) &&
      isNonEmptyString(value.phone) &&
      isNonEmptyString(value.accessToken) &&
      isNonEmptyString(value.refreshToken)
    ) {
      return value as unknown as PendingPhoneLoginChallenge
    }
  }

  return null
}
