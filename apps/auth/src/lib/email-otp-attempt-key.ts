import { createHash } from "node:crypto"

import { isCanonicalEmailIdentity } from "./normalize-email.ts"

export type EmailOtpType = "forgot_password" | "login_mfa" | "signup"

/**
 * One canonical attempt bucket per email OTP purpose.  This intentionally
 * preserves the existing `hashIdentifier("email", `${email}:${type}`)` byte
 * format while making send, verify, expiry, and tests use the same function.
 */
export function getEmailOtpAttemptKey(canonicalEmail: string, type: EmailOtpType): string {
  if (!isCanonicalEmailIdentity(canonicalEmail)) {
    throw new Error("Email OTP attempt keys require a canonical email")
  }

  const digest = createHash("sha256")
    .update(`email:${canonicalEmail}:${type}`)
    .digest("hex")

  return `@nodiox/otp_attempts:${digest}`
}
