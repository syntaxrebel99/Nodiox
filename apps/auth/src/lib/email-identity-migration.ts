import { createHash, createHmac, timingSafeEqual } from "node:crypto"

import { isCanonicalEmailIdentity, normalizeEmail } from "./normalize-email.ts"

export interface AuthIdentitySnapshot {
  created_at?: unknown
  id?: unknown
  identity_id?: unknown
  identity_data?: unknown
  last_sign_in_at?: unknown
  provider?: unknown
  updated_at?: unknown
  user_id?: unknown
}

export interface AuthUserSnapshot {
  app_metadata?: unknown
  email?: unknown
  email_confirmed_at?: unknown
  id?: unknown
  identities?: unknown
  phone?: unknown
  phone_confirmed_at?: unknown
  raw_user_meta_data?: unknown
  user_metadata?: unknown
}

export interface AuthPhoneIdentityProjectionSnapshot {
  email?: unknown
  is_verified?: unknown
  phone?: unknown
  user_id?: unknown
}

export interface EmailIdentityMigrationCandidate {
  appMetadataFingerprint: string
  currentEmail: string
  currentEmailHash: string
  id: string
  identitiesFingerprint: string
  nonEmailIdentitiesFingerprint: string
  phoneFingerprint: string
  phoneConfirmedAtFingerprint: string
  phoneProjectionIsVerified: boolean
  phoneProjectionPhoneFingerprint: string | null
  rawUserMetadataFingerprint: string
  hasPhone: boolean
  requiresUpdate: boolean
  targetEmail: string
  targetEmailHash: string
}

export interface EmailIdentityMigrationRecoverySnapshot {
  appMetadataProof: string
  currentEmailHash: string
  identitiesProof: string
  nonEmailIdentitiesProof: string
  phoneConfirmedAtProof: string
  phoneProof: string
  phoneProjection: {
    hasPhone: boolean
    isVerified: boolean
    phoneProof: string | null
  }
  rawUserMetadataProof: string
  signature: string
  targetEmailHash: string
  userId: string
  version: 1
}

export interface EmailIdentityMigrationRecoveryDecision {
  action: "retry" | "verify_target" | "block"
  failures: string[]
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

function stableSerialize(value: unknown): string {
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

  return visit(value)
}

function stableFingerprint(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex")
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

function getNonEmailIdentitySnapshot(identities: unknown): unknown {
  if (!Array.isArray(identities)) return identities

  // Auth can update timestamps on linked identities independently of this
  // migration. Preserve all stable identity fields, including immutable IDs
  // and provider data, while deliberately excluding those mutable timestamps.
  return identities
    .filter((identity) => (
      typeof identity !== "object" || identity === null ||
      (identity as AuthIdentitySnapshot).provider !== "email"
    ))
    .map((identity) => {
      if (typeof identity !== "object" || identity === null) return identity

      const { created_at: _createdAt, last_sign_in_at: _lastSignInAt, updated_at: _updatedAt, ...stable } = (
        identity as Record<string, unknown>
      )
      return stable
    })
    .sort((left, right) => {
      const leftValue = stableSerialize(left)
      const rightValue = stableSerialize(right)
      if (leftValue < rightValue) return -1
      if (leftValue > rightValue) return 1
      return 0
    })
}

function getPhoneProjectionPhone(user: AuthUserSnapshot): string | null {
  // This is intentionally a projection of the database trigger, not phone
  // normalization. The trigger uses nullif(trim(coalesce(phone,
  // raw_user_meta_data ->> 'phone')), ''). In particular, an empty direct
  // phone does not fall back to metadata.
  const metadata = getUserMetadata(user)
  const phoneSource = user.phone === null || typeof user.phone === "undefined"
    ? (
        typeof metadata === "object" && metadata !== null
          ? (metadata as Record<string, unknown>).phone
          : null
      )
    : user.phone

  if (typeof phoneSource !== "string") return null

  const phone = phoneSource.trim()
  return phone.length > 0 ? phone : null
}

function isPhoneConfirmed(user: AuthUserSnapshot): boolean {
  return user.phone_confirmed_at !== null && typeof user.phone_confirmed_at !== "undefined"
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

    const projectionPhone = getPhoneProjectionPhone(user)

    candidates.push({
      appMetadataFingerprint: stableFingerprint(user.app_metadata),
      currentEmail: user.email,
      currentEmailHash: hashEmailForReport(user.email),
      hasPhone: projectionPhone !== null,
      id,
      identitiesFingerprint: stableFingerprint(user.identities),
      nonEmailIdentitiesFingerprint: stableFingerprint(getNonEmailIdentitySnapshot(user.identities)),
      phoneFingerprint: stableFingerprint(user.phone),
      phoneConfirmedAtFingerprint: stableFingerprint(user.phone_confirmed_at),
      phoneProjectionIsVerified: isPhoneConfirmed(user),
      phoneProjectionPhoneFingerprint: projectionPhone === null ? null : stableFingerprint(projectionPhone),
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
  if (stableFingerprint(user.phone_confirmed_at) !== candidate.phoneConfirmedAtFingerprint) {
    failures.push("phone_confirmation_changed")
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

  if (user.id !== candidate.id) {
    failures.push("user_id_changed")
  }

  if (!user.email_confirmed_at) {
    failures.push("email_not_confirmed")
  }

  if (identityEmail !== candidate.targetEmail) {
    failures.push("email_identity_mismatch")
  }

  if (
    stableFingerprint(getNonEmailIdentitySnapshot(user.identities)) !==
    candidate.nonEmailIdentitiesFingerprint
  ) {
    failures.push("non_email_linked_identities_changed")
  }

  if (stableFingerprint(user.app_metadata) !== candidate.appMetadataFingerprint) {
    failures.push("app_metadata_changed")
  }

  if (stableFingerprint(user.phone) !== candidate.phoneFingerprint) {
    failures.push("phone_changed")
  }

  if (stableFingerprint(user.phone_confirmed_at) !== candidate.phoneConfirmedAtFingerprint) {
    failures.push("phone_confirmation_changed")
  }

  if (stableFingerprint(getUserMetadata(user)) !== candidate.rawUserMetadataFingerprint) {
    failures.push("raw_user_metadata_changed")
  }

  return failures
}

/**
 * Verifies the public phone projection maintained by
 * sync_auth_user_phone_identity(). The expected value is derived from the
 * same source fields as that trigger, but never normalizes a phone number.
 */
export function verifyPhoneIdentityProjection(
  candidate: EmailIdentityMigrationCandidate,
  projection: AuthPhoneIdentityProjectionSnapshot | null,
): string[] {
  const failures: string[] = []

  if (!candidate.hasPhone) {
    if (projection !== null) failures.push("unexpected_phone_identity_projection")
    return failures
  }

  if (!projection) return ["missing_phone_identity_projection"]

  if (projection.user_id !== candidate.id) {
    failures.push("phone_identity_projection_user_mismatch")
  }
  if (projection.email !== candidate.targetEmail) {
    failures.push("phone_identity_projection_email_mismatch")
  }
  if (
    candidate.phoneProjectionPhoneFingerprint === null ||
    stableFingerprint(projection.phone) !== candidate.phoneProjectionPhoneFingerprint
  ) {
    failures.push("phone_identity_projection_phone_mismatch")
  }
  if (projection.is_verified !== candidate.phoneProjectionIsVerified) {
    failures.push("phone_identity_projection_verification_mismatch")
  }

  return failures
}

function hmacMigrationJournalValue(
  key: string,
  label: string,
  value: unknown,
): string {
  return createHmac("sha256", key)
    .update(`nodiox:email-identity-migration:journal:v1:${label}:`)
    .update(stableSerialize(value))
    .digest("hex")
}

function hasValidHmac(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)
}

function hmacsMatch(left: string, right: string): boolean {
  if (!hasValidHmac(left) || !hasValidHmac(right)) return false

  return timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"))
}

type RecoverySnapshotUnsigned = Omit<EmailIdentityMigrationRecoverySnapshot, "signature">

function getRecoverySnapshotSignature(
  key: string,
  snapshot: RecoverySnapshotUnsigned,
): string {
  return hmacMigrationJournalValue(key, "snapshot", snapshot)
}

function sealCandidateFingerprint(
  key: string,
  candidate: EmailIdentityMigrationCandidate,
  label: string,
  fingerprint: string,
): string {
  return hmacMigrationJournalValue(key, label, {
    fingerprint,
    targetEmailHash: candidate.targetEmailHash,
    userId: candidate.id,
  })
}

/**
 * Builds the durable, redacted state needed to distinguish a retry from a
 * completed-but-unjournaled Admin update. Only keyed HMACs of candidate
 * fingerprints are persisted; neither raw emails nor phone values are ever
 * written to the journal.
 */
export function createEmailIdentityMigrationRecoverySnapshot(
  candidate: EmailIdentityMigrationCandidate,
  journalHmacKey: string,
): EmailIdentityMigrationRecoverySnapshot {
  const unsigned: RecoverySnapshotUnsigned = {
    appMetadataProof: sealCandidateFingerprint(
      journalHmacKey,
      candidate,
      "app_metadata",
      candidate.appMetadataFingerprint,
    ),
    currentEmailHash: candidate.currentEmailHash,
    identitiesProof: sealCandidateFingerprint(
      journalHmacKey,
      candidate,
      "identities",
      candidate.identitiesFingerprint,
    ),
    nonEmailIdentitiesProof: sealCandidateFingerprint(
      journalHmacKey,
      candidate,
      "non_email_identities",
      candidate.nonEmailIdentitiesFingerprint,
    ),
    phoneConfirmedAtProof: sealCandidateFingerprint(
      journalHmacKey,
      candidate,
      "phone_confirmed_at",
      candidate.phoneConfirmedAtFingerprint,
    ),
    phoneProof: sealCandidateFingerprint(
      journalHmacKey,
      candidate,
      "phone",
      candidate.phoneFingerprint,
    ),
    phoneProjection: {
      hasPhone: candidate.hasPhone,
      isVerified: candidate.phoneProjectionIsVerified,
      phoneProof: candidate.phoneProjectionPhoneFingerprint === null
        ? null
        : sealCandidateFingerprint(
            journalHmacKey,
            candidate,
            "phone_projection_phone",
            candidate.phoneProjectionPhoneFingerprint,
          ),
    },
    rawUserMetadataProof: sealCandidateFingerprint(
      journalHmacKey,
      candidate,
      "raw_user_metadata",
      candidate.rawUserMetadataFingerprint,
    ),
    targetEmailHash: candidate.targetEmailHash,
    userId: candidate.id,
    version: 1,
  }

  return {
    ...unsigned,
    signature: getRecoverySnapshotSignature(journalHmacKey, unsigned),
  }
}

function isRecoverySnapshotShape(value: unknown): value is EmailIdentityMigrationRecoverySnapshot {
  if (typeof value !== "object" || value === null) return false
  const snapshot = value as Partial<EmailIdentityMigrationRecoverySnapshot>
  const projection = snapshot.phoneProjection

  return (
    snapshot.version === 1 &&
    typeof snapshot.userId === "string" &&
    typeof snapshot.currentEmailHash === "string" &&
    typeof snapshot.targetEmailHash === "string" &&
    hasValidHmac(snapshot.appMetadataProof) &&
    hasValidHmac(snapshot.identitiesProof) &&
    hasValidHmac(snapshot.nonEmailIdentitiesProof) &&
    hasValidHmac(snapshot.phoneConfirmedAtProof) &&
    hasValidHmac(snapshot.phoneProof) &&
    hasValidHmac(snapshot.rawUserMetadataProof) &&
    hasValidHmac(snapshot.signature) &&
    typeof projection === "object" && projection !== null &&
    typeof projection.hasPhone === "boolean" &&
    typeof projection.isVerified === "boolean" &&
    (
      projection.hasPhone
        ? hasValidHmac(projection.phoneProof)
        : projection.phoneProof === null
    )
  )
}

function verifyRecoverySnapshotSignature(
  snapshot: EmailIdentityMigrationRecoverySnapshot,
  journalHmacKey: string,
): boolean {
  const { signature, ...unsigned } = snapshot
  return hmacsMatch(signature, getRecoverySnapshotSignature(journalHmacKey, unsigned))
}

function verifyRecoveryProof(
  failures: string[],
  candidate: EmailIdentityMigrationCandidate,
  journalHmacKey: string,
  failure: string,
  proof: string,
  label: string,
  fingerprint: string,
) {
  if (!hmacsMatch(proof, sealCandidateFingerprint(journalHmacKey, candidate, label, fingerprint))) {
    failures.push(failure)
  }
}

/**
 * Chooses a fail-closed action for a journal entry left after update_started.
 * A source-state match can safely retry the Admin call. A target-state match
 * must still pass final user and projection verification before the caller
 * records recovery completion. All other states stop the migration.
 */
export function decideEmailIdentityMigrationRecovery(
  snapshotValue: unknown,
  candidate: EmailIdentityMigrationCandidate,
  journalHmacKey: string,
): EmailIdentityMigrationRecoveryDecision {
  if (!isRecoverySnapshotShape(snapshotValue)) {
    return { action: "block", failures: ["recovery_snapshot_malformed"] }
  }

  const snapshot = snapshotValue
  if (!verifyRecoverySnapshotSignature(snapshot, journalHmacKey)) {
    return { action: "block", failures: ["recovery_snapshot_integrity_failed"] }
  }
  if (snapshot.userId !== candidate.id) {
    return { action: "block", failures: ["recovery_user_id_mismatch"] }
  }
  if (snapshot.targetEmailHash !== candidate.targetEmailHash) {
    return { action: "block", failures: ["recovery_target_email_mismatch"] }
  }

  const compare = (includeFullIdentities: boolean): string[] => {
    const failures: string[] = []
    verifyRecoveryProof(
      failures,
      candidate,
      journalHmacKey,
      "app_metadata_changed",
      snapshot.appMetadataProof,
      "app_metadata",
      candidate.appMetadataFingerprint,
    )
    if (includeFullIdentities) {
      verifyRecoveryProof(
        failures,
        candidate,
        journalHmacKey,
        "linked_identities_changed",
        snapshot.identitiesProof,
        "identities",
        candidate.identitiesFingerprint,
      )
    }
    verifyRecoveryProof(
      failures,
      candidate,
      journalHmacKey,
      "non_email_linked_identities_changed",
      snapshot.nonEmailIdentitiesProof,
      "non_email_identities",
      candidate.nonEmailIdentitiesFingerprint,
    )
    verifyRecoveryProof(
      failures,
      candidate,
      journalHmacKey,
      "phone_changed",
      snapshot.phoneProof,
      "phone",
      candidate.phoneFingerprint,
    )
    verifyRecoveryProof(
      failures,
      candidate,
      journalHmacKey,
      "phone_confirmation_changed",
      snapshot.phoneConfirmedAtProof,
      "phone_confirmed_at",
      candidate.phoneConfirmedAtFingerprint,
    )
    verifyRecoveryProof(
      failures,
      candidate,
      journalHmacKey,
      "raw_user_metadata_changed",
      snapshot.rawUserMetadataProof,
      "raw_user_metadata",
      candidate.rawUserMetadataFingerprint,
    )
    if (snapshot.phoneProjection.hasPhone !== candidate.hasPhone) {
      failures.push("phone_identity_projection_presence_changed")
    }
    if (snapshot.phoneProjection.isVerified !== candidate.phoneProjectionIsVerified) {
      failures.push("phone_identity_projection_verification_changed")
    }
    if (snapshot.phoneProjection.phoneProof === null) {
      if (candidate.phoneProjectionPhoneFingerprint !== null) {
        failures.push("phone_identity_projection_phone_changed")
      }
    } else if (
      candidate.phoneProjectionPhoneFingerprint === null ||
      !hmacsMatch(
        snapshot.phoneProjection.phoneProof,
        sealCandidateFingerprint(
          journalHmacKey,
          candidate,
          "phone_projection_phone",
          candidate.phoneProjectionPhoneFingerprint,
        ),
      )
    ) {
      failures.push("phone_identity_projection_phone_changed")
    }

    return failures
  }

  if (candidate.currentEmailHash === snapshot.currentEmailHash) {
    const failures = compare(true)
    if (!candidate.requiresUpdate) failures.push("recovery_source_email_not_pending_update")
    return failures.length > 0 ? { action: "block", failures } : { action: "retry", failures: [] }
  }

  if (candidate.currentEmailHash === snapshot.targetEmailHash) {
    const failures = compare(false)
    return failures.length > 0
      ? { action: "block", failures }
      : { action: "verify_target", failures: [] }
  }

  return { action: "block", failures: ["recovery_email_state_unknown"] }
}
