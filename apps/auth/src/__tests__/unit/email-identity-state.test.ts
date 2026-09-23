import assert from "node:assert/strict"
import { describe, test } from "node:test"

import {
  createSignupEmailVerificationRecord,
  parseSignupEmailVerificationRecord,
} from "../../lib/email-identity-state.ts"

describe("versioned signup email identity state", () => {
  test("keeps canonical and delivery identities separate", () => {
    const state = createSignupEmailVerificationRecord(
      "firstlast@gmail.com",
      "First.Last+campaign@googlemail.com",
    )

    assert.equal(state.version, 1)
    assert.equal(state.canonicalEmail, "firstlast@gmail.com")
    assert.equal(state.recipientEmail, "First.Last+campaign@googlemail.com")
    assert.deepEqual(parseSignupEmailVerificationRecord(state), state)
  })

  test("rejects legacy strings, noncanonical identities, and mixed fields", () => {
    assert.equal(parseSignupEmailVerificationRecord("firstlast@gmail.com"), null)
    assert.equal(parseSignupEmailVerificationRecord({
      version: 1,
      canonicalEmail: "First.Last@googlemail.com",
      recipientEmail: "First.Last@googlemail.com",
      issuedAt: new Date().toISOString(),
    }), null)
    assert.equal(parseSignupEmailVerificationRecord({
      version: 1,
      canonicalEmail: "firstlast@gmail.com",
      recipientEmail: "other@example.com",
      issuedAt: new Date().toISOString(),
      legacyEmail: "firstlast@gmail.com",
    }), null)
  })
})
