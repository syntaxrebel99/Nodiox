import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  emailRateLimitIdentifier,
  phoneRateLimitIdentifier,
  serializeAuthRateLimitIdentifier,
} from "../../lib/auth-rate-limit-identifier.ts"
import { normalizeEmail } from "../../lib/normalize-email.ts"

describe("AuthRateLimitIdentifier", () => {
  test("uses the canonical email identity for Gmail and Googlemail aliases", () => {
    const gmail = emailRateLimitIdentifier(normalizeEmail("first.last+tag@gmail.com"))
    const googlemail = emailRateLimitIdentifier(normalizeEmail("First.Last+other@googlemail.com"))

    assert.deepStrictEqual(gmail, {
      kind: "email",
      canonicalEmail: "firstlast@gmail.com",
    })
    assert.deepStrictEqual(googlemail, gmail)
    assert.strictEqual(
      serializeAuthRateLimitIdentifier(gmail),
      "firstlast@gmail.com"
    )
  })

  test("does not apply Gmail rules to non-Gmail email identifiers", () => {
    const identifier = emailRateLimitIdentifier(normalizeEmail("First.Last+tag@outlook.com"))

    assert.deepStrictEqual(identifier, {
      kind: "email",
      canonicalEmail: "first.last+tag@outlook.com",
    })
    assert.strictEqual(
      serializeAuthRateLimitIdentifier(identifier),
      "first.last+tag@outlook.com"
    )
  })

  test("keeps phone identifiers separate and leaves phone normalization to phone auth", () => {
    const identifier = phoneRateLimitIdentifier("+213555123456")

    assert.deepStrictEqual(identifier, {
      kind: "phone",
      normalizedPhone: "+213555123456",
    })
    assert.strictEqual(
      serializeAuthRateLimitIdentifier(identifier),
      "+213555123456"
    )
  })

  test("rejects raw or unusable email input instead of normalizing in the limiter", () => {
    assert.throws(() => emailRateLimitIdentifier("First.Last+tag@googlemail.com"))
    assert.throws(() => emailRateLimitIdentifier("@gmail.com"))
  })
})
