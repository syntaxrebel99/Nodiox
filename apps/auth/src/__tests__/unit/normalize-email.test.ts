import assert from "node:assert/strict"
import { describe, test } from "node:test"
import {
  getRecipientEmail,
  isCanonicalEmailIdentity,
  normalizeEmail,
  resolveEmailIdentity,
} from "../../lib/normalize-email.ts"

describe("normalizeEmail", () => {
  test("canonicalizes Gmail dots, + tags, casing, and surrounding whitespace", () => {
    assert.strictEqual(
      normalizeEmail("  First.Last+shopping@GMAIL.com  "),
      "firstlast@gmail.com"
    )
  })

  test("canonicalizes Googlemail into the Gmail identity domain", () => {
    assert.strictEqual(
      normalizeEmail("First.Last+shopping@googlemail.com"),
      "firstlast@gmail.com"
    )
  })

  test("preserves dots and + tags for every non-Gmail domain", () => {
    const cases = [
      ["First.Last+tag@outlook.com", "first.last+tag@outlook.com"],
      ["First.Last+tag@yahoo.com", "first.last+tag@yahoo.com"],
      ["First.Last+tag@icloud.com", "first.last+tag@icloud.com"],
      ["First.Last+tag@proton.me", "first.last+tag@proton.me"],
      ["First.Last+tag@fastmail.com", "first.last+tag@fastmail.com"],
      ["First.Last+tag@example-workspace.test", "first.last+tag@example-workspace.test"],
      ["First.Last+tag@custom-domain.test", "first.last+tag@custom-domain.test"],
    ] as const

    for (const [input, expected] of cases) {
      assert.strictEqual(normalizeEmail(input), expected, input)
    }
  })

  test("is idempotent", () => {
    const canonicalEmail = normalizeEmail("First.Last+tag@googlemail.com")
    assert.strictEqual(normalizeEmail(canonicalEmail), canonicalEmail)
  })

  test("rejects a Gmail alias that collapses to an empty local part", () => {
    assert.strictEqual(normalizeEmail("+tag@gmail.com"), "@gmail.com")
    assert.strictEqual(isCanonicalEmailIdentity("@gmail.com"), false)
  })

  test("accepts only structurally usable canonical identities", () => {
    assert.strictEqual(isCanonicalEmailIdentity("firstlast@gmail.com"), true)
    assert.strictEqual(isCanonicalEmailIdentity("FirstLast@gmail.com"), false)
    assert.strictEqual(isCanonicalEmailIdentity("first.last+tag@outlook.com"), true)
    assert.strictEqual(isCanonicalEmailIdentity(" firstlast@gmail.com"), false)
  })

  test("keeps the delivery recipient distinct from the canonical identity", () => {
    const input = "  First.Last+shopping@GoogleMail.com  "

    assert.strictEqual(getRecipientEmail(input), "First.Last+shopping@GoogleMail.com")
    assert.deepStrictEqual(resolveEmailIdentity(input), {
      canonicalEmail: "firstlast@gmail.com",
      recipientEmail: "First.Last+shopping@GoogleMail.com",
    })
  })
})
