import { isCanonicalEmailIdentity } from "./normalize-email.ts"

export type EmailRateLimitIdentifier = Readonly<{
  kind: "email"
  canonicalEmail: string
}>

export type PhoneRateLimitIdentifier = Readonly<{
  kind: "phone"
  normalizedPhone: string
}>

/**
 * An explicit identifier type keeps email canonicalization and phone
 * normalization separate at rate-limit call sites.
 */
export type AuthRateLimitIdentifier =
  | EmailRateLimitIdentifier
  | PhoneRateLimitIdentifier

/**
 * Routes must resolve and validate an email identity before it reaches the
 * rate limiter. This helper deliberately does not normalize raw input, so
 * the limiter cannot become a second identity-normalization path.
 */
export function emailRateLimitIdentifier(canonicalEmail: string): EmailRateLimitIdentifier {
  if (!isCanonicalEmailIdentity(canonicalEmail)) {
    throw new Error("Email rate-limit identifiers require a canonical email")
  }

  return {
    kind: "email",
    canonicalEmail,
  }
}

/**
 * Phone normalization is intentionally owned by the phone-auth path. This
 * factory records the supplied normalized phone without applying email rules
 * or guessing the identifier type from its contents.
 */
export function phoneRateLimitIdentifier(normalizedPhone: string): PhoneRateLimitIdentifier {
  return {
    kind: "phone",
    normalizedPhone,
  }
}

/**
 * Stable representation used before a rate-limit key is hashed. Email and
 * phone callers are type-separated before this point; the values themselves
 * are unambiguous because a normalized phone cannot contain `@`. Keeping the
 * wire representation unchanged preserves all existing phone buckets during
 * the email-policy cutover.
 */
export function serializeAuthRateLimitIdentifier(identifier: AuthRateLimitIdentifier): string {
  return identifier.kind === "email"
    ? identifier.canonicalEmail
    : identifier.normalizedPhone
}
