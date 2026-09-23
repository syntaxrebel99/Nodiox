export type EmailIdentity = Readonly<{
  canonicalEmail: string
  recipientEmail: string
}>

/**
 * Returns the address used for delivery. This is deliberately not an identity
 * normalizer: apart from surrounding whitespace, it preserves the local part
 * exactly as the user supplied it (including case, dots, and + tags).
 */
export function getRecipientEmail(email: string): string {
  return email.trim()
}

/**
 * Returns Nodiox's permanent canonical email identity.
 *
 * Canonical identities are case-folded. gmail.com and googlemail.com share
 * gmail.com; only for those domains are dots and a + tag removed from the
 * local part. Every other domain retains dots and + tags unchanged.
 */
export function normalizeEmail(email: string): string {
  const recipientEmail = getRecipientEmail(email)
  const caseFoldedEmail = recipientEmail.toLowerCase()
  const atIndex = caseFoldedEmail.indexOf("@")

  // Request schemas validate email syntax. Do not infer a structure from
  // malformed input; callers reject it with isCanonicalEmailIdentity().
  if (
    atIndex <= 0 ||
    atIndex !== caseFoldedEmail.lastIndexOf("@") ||
    atIndex === caseFoldedEmail.length - 1
  ) {
    return caseFoldedEmail
  }

  const local = caseFoldedEmail.slice(0, atIndex)
  const domain = caseFoldedEmail.slice(atIndex + 1)
  const isGmailIdentity = domain === "gmail.com" || domain === "googlemail.com"

  if (!isGmailIdentity) {
    return `${local}@${domain}`
  }

  const gmailLocal = local.replace(/\./g, "").split("+", 1)[0]
  return `${gmailLocal}@gmail.com`
}

/**
 * Validates an already-canonical identity without introducing another
 * normalization algorithm.  This is deliberately separate from
 * normalizeEmail(): a syntactically accepted input such as `+tag@gmail.com`
 * has no usable Gmail local part after the required alias rules are applied.
 */
export function isCanonicalEmailIdentity(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    return false
  }

  const atIndex = value.indexOf("@")
  if (
    atIndex <= 0 ||
    atIndex !== value.lastIndexOf("@") ||
    atIndex === value.length - 1 ||
    /\s/.test(value)
  ) {
    return false
  }

  return normalizeEmail(value) === value
}

/**
 * Resolves the two deliberately separate email representations used by auth:
 * canonicalEmail for identity and recipientEmail for outbound delivery.
 */
export function resolveEmailIdentity(email: string): EmailIdentity {
  const recipientEmail = getRecipientEmail(email)
  return {
    canonicalEmail: normalizeEmail(recipientEmail),
    recipientEmail,
  }
}
