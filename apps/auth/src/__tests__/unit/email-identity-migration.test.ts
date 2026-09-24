import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  createEmailIdentityMigrationRecoverySnapshot,
  decideEmailIdentityMigrationRecovery,
  planEmailIdentityMigration,
  verifyMigrationPrecondition,
  verifyUpdatedEmailIdentity,
  verifyPhoneIdentityProjection,
} from "../../lib/email-identity-migration.ts"

const identity = (email: string) => ({ provider: "email", identity_data: { email } })
const phoneIdentity = (phone: string) => ({
  identity_id: `identity-${phone}`,
  identity_data: { phone },
  provider: "phone",
  user_id: "user",
})

describe("email identity migration planner", () => {
  test("uses the production Gmail and Googlemail policy to find a collision", () => {
    const plan = planEmailIdentityMigration([
      {
        id: "first",
        email: "first.last@gmail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("first.last@gmail.com")],
      },
      {
        id: "second",
        email: "firstlast@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("firstlast@googlemail.com")],
      },
    ])

    assert.strictEqual(plan.updates, 2)
    assert.deepStrictEqual(plan.blockers.map((blocker) => blocker.code), ["ambiguous_canonical_identity"])
    assert.deepStrictEqual(plan.blockers[0].userIds, ["first", "second"])
  })

  test("preserves non-Gmail tags and does not manufacture a collision", () => {
    const plan = planEmailIdentityMigration([
      {
        id: "first",
        email: "name+one@example.test",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("name+one@example.test")],
      },
      {
        id: "second",
        email: "name+two@example.test",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("name+two@example.test")],
      },
    ])

    assert.strictEqual(plan.blockers.length, 0)
    assert.strictEqual(plan.unchanged, 2)
  })

  test("halts an unconfirmed account before any update", () => {
    const plan = planEmailIdentityMigration([
      {
        id: "unconfirmed",
        email: "first.last@googlemail.com",
        email_confirmed_at: null,
        identities: [identity("first.last@googlemail.com")],
      },
    ])

    assert.deepStrictEqual(plan.blockers.map((blocker) => blocker.code), ["unconfirmed_email_change"])
  })

  test("halts an address whose Gmail alias would collapse to an empty local part", () => {
    const plan = planEmailIdentityMigration([
      {
        id: "malformed",
        email: "+tag@gmail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("+tag@gmail.com")],
      },
    ])

    assert.deepStrictEqual(plan.blockers.map((blocker) => blocker.code), ["missing_or_malformed_email"])
  })

  test("verifies readback identity and metadata without exposing raw email", () => {
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: "2026-01-02T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com"), phoneIdentity("+213555123456")],
        app_metadata: { role: "member" },
        raw_user_meta_data: { name: "First" },
        phone: "+213555123456",
      },
    ]).candidates

    assert.deepStrictEqual(
      verifyUpdatedEmailIdentity(candidate, {
        id: "user",
        email: "firstlast@gmail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: "2026-01-02T00:00:00.000Z",
        identities: [identity("firstlast@gmail.com"), phoneIdentity("+213555123456")],
        app_metadata: { role: "member" },
        raw_user_meta_data: { name: "First" },
        phone: "+213555123456",
      }),
      []
    )
  })

  test("rejects a stale snapshot before an Admin API update", () => {
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com")],
        app_metadata: { role: "member" },
        raw_user_meta_data: { name: "First" },
      },
    ]).candidates

    assert.deepStrictEqual(
      verifyMigrationPrecondition(candidate, {
        id: "user",
        email: "someone-else@example.test",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("someone-else@example.test")],
        app_metadata: { role: "member" },
        raw_user_meta_data: { name: "First" },
      }),
      ["current_email_changed", "linked_identities_changed"],
    )
  })

  test("rejects a stale linked-identity snapshot before an Admin API update", () => {
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com")],
      },
    ]).candidates

    assert.deepStrictEqual(
      verifyMigrationPrecondition(candidate, {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [
          identity("first.last@googlemail.com"),
          { provider: "phone", identity_data: { phone: "+213555123456" } },
        ],
      }),
      ["linked_identities_changed"],
    )
  })

  test("rejects a concurrent phone change before or after an email update", () => {
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com")],
        phone: "+213555123456",
      },
    ]).candidates

    const updatedUser = {
      id: "user",
      email: "firstlast@gmail.com",
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      identities: [identity("firstlast@gmail.com")],
      phone: "+213555654321",
    }

    assert.deepStrictEqual(
      verifyMigrationPrecondition(candidate, {
        ...updatedUser,
        email: "first.last@googlemail.com",
        identities: [identity("first.last@googlemail.com")],
      }),
      ["phone_changed"],
    )
    assert.deepStrictEqual(verifyUpdatedEmailIdentity(candidate, updatedUser), ["phone_changed"])
  })

  test("rejects post-update loss of a non-email identity and phone confirmation", () => {
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: "2026-01-02T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com"), phoneIdentity("+213555123456")],
        phone: "+213555123456",
      },
    ]).candidates

    assert.deepStrictEqual(
      verifyUpdatedEmailIdentity(candidate, {
        id: "user",
        email: "firstlast@gmail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: null,
        identities: [identity("firstlast@gmail.com")],
        phone: "+213555123456",
      }),
      ["non_email_linked_identities_changed", "phone_confirmation_changed"],
    )
  })

  test("treats equivalent non-email identity JSON representations as preserved but detects stable changes", () => {
    const sourcePhoneIdentity = {
      identity_data: {
        phone: "+213555123456",
        phone_verified: true,
        sub: "user",
      },
      identity_id: "phone-identity",
      provider: "phone",
      user_id: "user",
    }
    const readBackPhoneIdentity = {
      provider: "phone",
      user_id: "user",
      identity_id: "phone-identity",
      identity_data: {
        sub: "user",
        phone_verified: true,
        phone: "+213555123456",
      },
    }
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com"), sourcePhoneIdentity],
      },
    ]).candidates

    assert.deepStrictEqual(
      verifyUpdatedEmailIdentity(candidate, {
        id: "user",
        email: "firstlast@gmail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("firstlast@gmail.com"), readBackPhoneIdentity],
      }),
      [],
    )

    assert.deepStrictEqual(
      verifyUpdatedEmailIdentity(candidate, {
        id: "user",
        email: "firstlast@gmail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [
          identity("firstlast@gmail.com"),
          {
            ...readBackPhoneIdentity,
            identity_data: {
              ...readBackPhoneIdentity.identity_data,
              phone_verified: false,
            },
          },
        ],
      }),
      ["non_email_linked_identities_changed"],
    )
  })

  test("uses the Auth readback phone representation rather than the Admin input", () => {
    const adminPhoneInput = "+15551234567890"
    const storedPhone = "15551234567890"
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone: storedPhone,
        phone_confirmed_at: "2026-01-02T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com"), phoneIdentity(storedPhone)],
        user_metadata: { phone: adminPhoneInput },
      },
    ]).candidates

    const updatedUser = {
      id: "user",
      email: "firstlast@gmail.com",
      email_confirmed_at: "2026-01-01T00:00:00.000Z",
      phone: storedPhone,
      phone_confirmed_at: "2026-01-02T00:00:00.000Z",
      identities: [identity("firstlast@gmail.com"), phoneIdentity(storedPhone)],
      user_metadata: { phone: adminPhoneInput },
    }

    assert.deepStrictEqual(verifyUpdatedEmailIdentity(candidate, updatedUser), [])
    assert.deepStrictEqual(
      verifyPhoneIdentityProjection(candidate, {
        email: "firstlast@gmail.com",
        is_verified: true,
        phone: storedPhone,
        user_id: "user",
      }),
      [],
    )
    assert.deepStrictEqual(
      verifyUpdatedEmailIdentity(candidate, { ...updatedUser, phone: adminPhoneInput }),
      ["phone_changed"],
    )
  })

  test("rejects a changed phone confirmation before an Admin API update", () => {
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: "2026-01-02T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com")],
      },
    ]).candidates

    assert.deepStrictEqual(
      verifyMigrationPrecondition(candidate, {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: null,
        identities: [identity("first.last@googlemail.com")],
      }),
      ["phone_confirmation_changed"],
    )
  })

  test("verifies every phone identity projection field", () => {
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "first.last@googlemail.com",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: "2026-01-02T00:00:00.000Z",
        identities: [identity("first.last@googlemail.com")],
        phone: "+213555123456",
      },
    ]).candidates

    const matchingProjection = {
      email: "firstlast@gmail.com",
      is_verified: true,
      phone: "+213555123456",
      user_id: "user",
    }
    assert.deepStrictEqual(verifyPhoneIdentityProjection(candidate, matchingProjection), [])
    assert.deepStrictEqual(
      verifyPhoneIdentityProjection(candidate, { ...matchingProjection, phone: "+213555654321" }),
      ["phone_identity_projection_phone_mismatch"],
    )
    assert.deepStrictEqual(
      verifyPhoneIdentityProjection(candidate, { ...matchingProjection, is_verified: false }),
      ["phone_identity_projection_verification_mismatch"],
    )
    assert.deepStrictEqual(verifyPhoneIdentityProjection(candidate, null), ["missing_phone_identity_projection"])
  })

  test("rejects an unexpected projection when the trigger source is empty", () => {
    const [candidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: "user@example.test",
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        identities: [identity("user@example.test")],
        // The SQL trigger's coalesce() selects this empty direct value before
        // metadata, then nullif(trim(...), '') leaves no projection.
        phone: "",
        raw_user_meta_data: { phone: "+213555123456" },
      },
    ]).candidates

    assert.deepStrictEqual(
      verifyPhoneIdentityProjection(candidate, {
        email: "user@example.test",
        is_verified: false,
        phone: "+213555123456",
        user_id: "user",
      }),
      ["unexpected_phone_identity_projection"],
    )
  })

  test("makes interrupted migration recovery fail closed without raw PII in its snapshot", () => {
    const sourceEmail = "first.last@googlemail.com"
    const targetEmail = "firstlast@gmail.com"
    const phone = "+213555123456"
    const journalHmacKey = "unit-test-journal-hmac-key"
    const [sourceCandidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: sourceEmail,
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: "2026-01-02T00:00:00.000Z",
        identities: [identity(sourceEmail), phoneIdentity(phone)],
        app_metadata: { role: "member" },
        raw_user_meta_data: { phone },
        phone,
      },
    ]).candidates
    const snapshot = createEmailIdentityMigrationRecoverySnapshot(sourceCandidate, journalHmacKey)

    const serialized = JSON.stringify(snapshot)
    assert.ok(!serialized.includes(sourceEmail))
    assert.ok(!serialized.includes(targetEmail))
    assert.ok(!serialized.includes(phone))

    assert.deepStrictEqual(
      decideEmailIdentityMigrationRecovery(snapshot, sourceCandidate, journalHmacKey),
      { action: "retry", failures: [] },
    )

    const [preservedTargetCandidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: targetEmail,
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: "2026-01-02T00:00:00.000Z",
        identities: [identity(targetEmail), phoneIdentity(phone)],
        app_metadata: { role: "member" },
        raw_user_meta_data: { phone },
        phone,
      },
    ]).candidates
    assert.deepStrictEqual(
      decideEmailIdentityMigrationRecovery(snapshot, preservedTargetCandidate, journalHmacKey),
      { action: "verify_target", failures: [] },
    )

    const [damagedTargetCandidate] = planEmailIdentityMigration([
      {
        id: "user",
        email: targetEmail,
        email_confirmed_at: "2026-01-01T00:00:00.000Z",
        phone_confirmed_at: null,
        identities: [identity(targetEmail)],
        app_metadata: { role: "member" },
        raw_user_meta_data: { phone },
        phone,
      },
    ]).candidates
    const damagedDecision = decideEmailIdentityMigrationRecovery(
      snapshot,
      damagedTargetCandidate,
      journalHmacKey,
    )
    assert.strictEqual(damagedDecision.action, "block")
    assert.deepStrictEqual(damagedDecision.failures, [
      "non_email_linked_identities_changed",
      "phone_confirmation_changed",
      "phone_identity_projection_verification_changed",
    ])

    assert.deepStrictEqual(
      decideEmailIdentityMigrationRecovery(undefined, sourceCandidate, journalHmacKey),
      { action: "block", failures: ["recovery_snapshot_malformed"] },
    )

    assert.deepStrictEqual(
      decideEmailIdentityMigrationRecovery(
        { ...snapshot, signature: "0".repeat(64) },
        sourceCandidate,
        journalHmacKey,
      ),
      { action: "block", failures: ["recovery_snapshot_integrity_failed"] },
    )
  })
})
