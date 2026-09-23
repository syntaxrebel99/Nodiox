import { createHash } from "node:crypto"

import { isCanonicalEmailIdentity, normalizeEmail } from "./normalize-email.ts"

export interface AuthIdentitySnapshot {
  identity_data?: unknown
  provider?: unknown
}

export interface AuthUserSnapshot {
  app_metadata?: unknown
  email?: unknown
  email_confirmed_at?: unknown
  id?: unknown
  identities?: unknown
  phone?: unknown
  raw_user_meta_data?: unknown
  user_metadata?: unknown
}

export interface EmailIdentityMigrationCandidate {
  appMetadataFingerprint: string
  currentEmail: string
  currentEmailHash: string
  id: string
  identitiesFingerprint: string
  phoneFingerprint: string
  rawUserMetadataFingerprint: string
  hasPhone: boolean
  requiresUpdate: boolean
  targetEmail: string
  targetEmailHash: string
}

export interface EmailIdentityMigrationBlocker {
  code:
    | "ambiguous_canonical_identity"
    | "email_identity_mismatch"
    | "missing_email_identity"
    | "missing_or_malformed_email"
    | "unconfirmed_email_change"
  details: string
  userIds: string[]
}

export interface EmailIdentityMigrationPlan {
  blockers: EmailIdentityMigrationBlocker[]
  candidates: EmailIdentityMigrationCandidate[]
  scanned: number
  unchanged: number
  updates: number
  warnings: Array<{ code: "non_email_identity_present"; userId: string }>
}

export function hashEmailForReport(email: string): string {
  return createHash("sha256").update(`email-identity-migration:${email}`).digest("hex")
}

function stableFingerprint(value: unknown): string {
  const visit = (input: unknown): string => {
    if (input === null) return "null"
    if (typeof input === "string") return JSON.stringify(input)
    if (typeof input === "number" || typeof input === "boolean") return String(input)
    if (typeof input === "undefined") return "undefined"
    if (Array.isArray(input)) return `[${input.map(visit).join(",")}]`
    if (typeof input === "object") {
      const record = input as Record<string, unknown>
      return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${visit(record[key])}`).join(",")}}`
    }
    return String(input)
  }

  return createHash("sha256").update(visit(value)).digest("hex")
}

function isStoredEmail(value: unknown): value is string {
  if (typeof value !== "string" || value !== value.trim()) return false
  const atIndex = value.indexOf("@")
  return atIndex > 0 && atIndex === value.lastIndexOf("@") && atIndex < value.length - 1
}

function getEmailIdentity(identities: unknown): AuthIdentitySnapshot | null {
  if (!Array.isArray(identities)) return null

  const emailIdentities = identities.filter((identity): identity is AuthIdentitySnapshot => (
    typeof identity === "object" && identity !== null &&
    (identity as AuthIdentitySnapshot).provider === "email"
  ))

  return emailIdentities.length === 1 ? emailIdentities[0] : null
}

function getIdentityEmail(identity: AuthIdentitySnapshot | null): string | null {
  if (!identity || typeof identity.identity_data !== "object" || identity.identity_data === null) {
    return null
  }

  const email = (identity.identity_data as Record<string, unknown>).email
  return typeof email === "string" ? email : null
}

function getUserMetadata(user: AuthUserSnapshot): unknown {
  // The Auth Admin API calls this field `user_metadata`; direct database
  // snapshots call the same value `raw_user_meta_data`. Accept both so the
  // planner verifies the metadata returned by the actual API rather than
  // fingerprinting `undefined`.
  return user.raw_user_meta_data ?? user.user_metadata
}

function hasPhoneIdentity(user: AuthUserSnapshot): boolean {
  if (typeof user.phone === "string" && user.phone.trim().length > 0) {
    return true
  }

  const metadata = getUserMetadata(user)
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    typeof (metadata as Record<string, unknown>).phone === "string" &&
    ((metadata as Record<string, unknown>).phone as string).trim().length > 0
  )
}

/**
 * Builds a write-free migration plan. It intentionally calls the production
 * normalizeEmail() implementation instead of duplicating its provider rules.
 */
export function planEmailIdentityMigration(users: readonly AuthUserSnapshot[]): EmailIdentityMigrationPlan {
  const candidates: EmailIdentityMigrationCandidate[] = []
  const blockers: EmailIdentityMigrationBlocker[] = []
  const warnings: EmailIdentityMigrationPlan["warnings"] = []

  for (const user of users) {
    const id = typeof user.id === "string" && user.id.length > 0 ? user.id : null
    if (!id || !isStoredEmail(user.email)) {
      blockers.push({
        code: "missing_or_malformed_email",
        details: "Auth user has no usable stored email identity.",
        userIds: id ? [id] : [],
      })
      continue
    }

    const targetEmail = normalizeEmail(user.email)
    if (!isCanonicalEmailIdentity(targetEmail)) {
      blockers.push({
        code: "missing_or_malformed_email",
        details: "Email canonicalization produced an unusable identity.",
        userIds: [id],
      })
      continue
    }
    const emailIdentity = getEmailIdentity(user.identities)
    const identityEmail = getIdentityEmail(emailIdentity)

    if (!emailIdentity) {
      blockers.push({
        code: "missing_email_identity",
        details: "Auth user does not have exactly one provider=email identity.",
        userIds: [id],
      })
      continue
    }

    const identityMatchesTarget = identityEmail === targetEmail
    const identityCanMigrateWithUser =
      typeof identityEmail === "string" && normalizeEmail(identityEmail) === targetEmail

    // A changed Auth email may still have its prior alias in auth.identities;
    // the supported Admin update is expected to synchronize it and the script
    // verifies that postcondition. If auth.users.email is already canonical,
    // however, a non-exact linked identity is evidence of partial/corrupt
    // state and must stop rather than be silently treated as unchanged.
    if (
      !identityEmail ||
      (!identityMatchesTarget && (targetEmail === user.email || !identityCanMigrateWithUser))
    ) {
      blockers.push({
        code: "email_identity_mismatch",
        details: "The provider=email identity is inconsistent with the Auth user's canonical identity.",
        userIds: [id],
      })
      continue
    }

    if (targetEmail !== user.email && !user.email_confirmed_at) {
      blockers.push({
        code: "unconfirmed_email_change",
        details: "Changing an unconfirmed email would silently assert a new confirmed identity.",
        userIds: [id],
      })
      continue
    }

    if (Array.isArray(user.identities) && user.identities.some((identity) => (
      typeof identity === "object" && identity !== null &&
      (identity as AuthIdentitySnapshot).provider !== "email"
    ))) {
      warnings.push({ code: "non_email_identity_present", userId: id })
    }

    candidates.push({
      appMetadataFingerprint: stableFingerprint(user.app_metadata),
      currentEmail: user.email,
      currentEmailHash: hashEmailForReport(user.email),
      hasPhone: hasPhoneIdentity(user),
      id,
      identitiesFingerprint: stableFingerprint(user.identities),
      phoneFingerprint: stableFingerprint(user.phone),
      rawUserMetadataFingerprint: stableFingerprint(getUserMetadata(user)),
      requiresUpdate: targetEmail !== user.email,
      targetEmail,
      targetEmailHash: hashEmailForReport(targetEmail),
    })
  }

  const byTarget = new Map<string, EmailIdentityMigrationCandidate[]>()
  for (const candidate of candidates) {
    const group = byTarget.get(candidate.targetEmail) ?? []
    group.push(candidate)
    byTarget.set(candidate.targetEmail, group)
  }

  for (const [targetEmail, group] of byTarget) {
    if (group.length > 1) {
      blockers.push({
        code: "ambiguous_canonical_identity",
        details: `Multiple Auth users resolve to ${hashEmailForReport(targetEmail)}.`,
        userIds: group.map((candidate) => candidate.id).sort(),
      })
    }
  }

  return {
    blockers,
    candidates,
    scanned: users.length,
    unchanged: candidates.filter((candidate) => !candidate.requiresUpdate).length,
    updates: candidates.filter((candidate) => candidate.requiresUpdate).length,
    warnings,
  }
}

/**
 * Confirms that the account has not changed since the read-only plan was
 * built. This prevents an interrupted maintenance run from overwriting a
 * concurrent administrator change with a stale snapshot.
 */
export function verifyMigrationPrecondition(
  candidate: EmailIdentityMigrationCandidate,
  user: AuthUserSnapshot,
): string[] {
  const failures: string[] = []
  if (user.id !== candidate.id) failures.push("user_id_changed")
  if (user.email !== candidate.currentEmail) failures.push("current_email_changed")
  if (stableFingerprint(user.identities) !== candidate.identitiesFingerprint) {
    failures.push("linked_identities_changed")
  }
  if (stableFingerprint(user.app_metadata) !== candidate.appMetadataFingerprint) {
    failures.push("app_metadata_changed")
  }
  if (stableFingerprint(user.phone) !== candidate.phoneFingerprint) {
    failures.push("phone_changed")
  }
  if (stableFingerprint(getUserMetadata(user)) !== candidate.rawUserMetadataFingerprint) {
    failures.push("raw_user_metadata_changed")
  }
  if (!user.email_confirmed_at && candidate.requiresUpdate) {
    failures.push("email_no_longer_confirmed")
  }

  return failures
}

export function verifyUpdatedEmailIdentity(
  candidate: EmailIdentityMigrationCandidate,
  user: AuthUserSnapshot
): string[] {
  const failures: string[] = []
  const userEmail = typeof user.email === "string" ? user.email : null
  const emailIdentity = getEmailIdentity(user.identities)
  const identityEmail = getIdentityEmail(emailIdentity)

  if (userEmail !== candidate.targetEmail) {
    failures.push("auth_user_email_mismatch")
  }

  if (!user.email_confirmed_at) {
    failures.push("email_not_confirmed")
  }

  if (identityEmail !== candidate.targetEmail) {
    failures.push("email_identity_mismatch")
  }

  if (stableFingerprint(user.app_metadata) !== candidate.appMetadataFingerprint) {
    failures.push("app_metadata_changed")
  }

  if (stableFingerprint(user.phone) !== candidate.phoneFingerprint) {
    failures.push("phone_changed")
  }

  if (stableFingerprint(getUserMetadata(user)) !== candidate.rawUserMetadataFingerprint) {
    failures.push("raw_user_metadata_changed")
  }

  return failures
}
