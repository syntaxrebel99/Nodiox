import { createHash } from "node:crypto"

import { isCanonicalEmailIdentity } from "./normalize-email.ts"

export type EmailOtpType = "forgot_password" | "login_mfa" | "signup"

export type EmailOtpAttemptGeneration = Readonly<{
  id: string
  codeHash: string
  codeSalt: string
  codeVersion: string
  expiresAt: string
}>

/**
 * Attempt counters are scoped to one credential generation, rather than an
 * email/type pair. A resend replaces the row in place, so the stable row ID
 * alone is not enough to distinguish the old credential from its replacement.
 */
export function getEmailOtpAttemptKey(
  canonicalEmail: string,
  type: EmailOtpType,
  generation: EmailOtpAttemptGeneration,
): string {
  if (!isCanonicalEmailIdentity(canonicalEmail)) {
    throw new Error("Email OTP attempt keys require a canonical email")
  }

  if (
    !generation.id ||
    !generation.codeHash ||
    !generation.codeSalt ||
    !generation.codeVersion ||
    !generation.expiresAt
  ) {
    throw new Error("Email OTP attempt keys require a complete credential generation")
  }

  const digest = createHash("sha256")
    .update(
      `email_otp_attempts:v2:${canonicalEmail}:${type}:${generation.id}:${generation.codeHash}:${generation.codeSalt}:${generation.codeVersion}:${generation.expiresAt}`,
    )
    .digest("hex")

  return `@nodiox/otp_attempts:v2:${digest}`
}
