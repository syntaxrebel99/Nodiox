import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { createHash } from "node:crypto"

import { getEmailOtpAttemptKey } from "../../lib/email-otp-attempt-key.ts"

describe("email OTP attempt key", () => {
  test("uses the same canonical email/type key for resend and verify", () => {
    const expectedDigest = createHash("sha256")
      .update("email:firstlast@gmail.com:signup")
      .digest("hex")

    assert.equal(
      getEmailOtpAttemptKey("firstlast@gmail.com", "signup"),
      `@nodiox/otp_attempts:${expectedDigest}`,
    )
    assert.notEqual(
      getEmailOtpAttemptKey("firstlast@gmail.com", "signup"),
      getEmailOtpAttemptKey("firstlast@gmail.com", "login_mfa"),
    )
  })

  test("rejects a noncanonical identity", () => {
    assert.throws(() => getEmailOtpAttemptKey("First.Last+tag@googlemail.com", "signup"))
  })
})
