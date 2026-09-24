import assert from "node:assert/strict"
import { describe, test } from "node:test"
import { createHash } from "node:crypto"

import { getEmailOtpAttemptKey } from "../../lib/email-otp-attempt-key.ts"

describe("email OTP attempt key", () => {
  const generation = {
    id: "credential-row",
    codeHash: "credential-hash",
    codeSalt: "credential-salt",
    codeVersion: "otp_hmac_sha256_v1",
    expiresAt: "2026-09-23T12:10:00.000Z",
  }

  test("uses a canonical, generation-bound key for verification attempts", () => {
    const expectedDigest = createHash("sha256")
      .update(
        "email_otp_attempts:v2:firstlast@gmail.com:signup:credential-row:credential-hash:credential-salt:otp_hmac_sha256_v1:2026-09-23T12:10:00.000Z",
      )
      .digest("hex")

    assert.equal(
      getEmailOtpAttemptKey("firstlast@gmail.com", "signup", generation),
      `@nodiox/otp_attempts:v2:${expectedDigest}`,
    )
    assert.notEqual(
      getEmailOtpAttemptKey("firstlast@gmail.com", "signup", generation),
      getEmailOtpAttemptKey("firstlast@gmail.com", "login_mfa", generation),
    )
    assert.notEqual(
      getEmailOtpAttemptKey("firstlast@gmail.com", "signup", generation),
      getEmailOtpAttemptKey("firstlast@gmail.com", "signup", {
        ...generation,
        codeSalt: "replacement-salt",
      }),
    )
  })

  test("rejects a noncanonical identity", () => {
    assert.throws(() => getEmailOtpAttemptKey("First.Last+tag@googlemail.com", "signup", generation))
  })

  test("rejects an incomplete credential generation", () => {
    assert.throws(() => getEmailOtpAttemptKey("firstlast@gmail.com", "signup", {
      ...generation,
      codeHash: "",
    }))
  })
})
