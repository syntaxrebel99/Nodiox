import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  planEmailIdentityMigration,
  verifyMigrationPrecondition,
  verifyUpdatedEmailIdentity,
} from "../../lib/email-identity-migration.ts"

const identity = (email: string) => ({ provider: "email", identity_data: { email } })

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
        identities: [identity("first.last@googlemail.com")],
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
        identities: [identity("firstlast@gmail.com")],
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
})
