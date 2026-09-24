import assert from "node:assert/strict"
import { describe, test } from "node:test"

const requiredAuthEnv: Record<string, string> = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
  RESEND_API_KEY: "test-resend-key",
  AUTH_SMS_PROVIDER: "mock",
  AUTH_MOCK_SMS_CODE: "123456",
}

for (const [key, value] of Object.entries(requiredAuthEnv)) {
  process.env[key] ??= value
}

const { parsePendingLoginChallenge } = await import("../../lib/pending-login-state.ts")

const issuedAt = "2026-09-22T12:00:00.000Z"

describe("pending login challenge state", () => {
  test("accepts a strict V1 email challenge with a canonical identity", () => {
    const state = {
      version: 1,
      method: "email",
      canonicalEmail: "firstlast@gmail.com",
      recipientEmail: "First.Last+login@GoogleMail.com",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      issuedAt,
    }

    assert.deepStrictEqual(parsePendingLoginChallenge(state), state)
  })

  test("accepts a strict V1 phone challenge without email fields", () => {
    const state = {
      version: 1,
      method: "phone",
      phone: "+213555123456",
      accessToken: "access-token",
      refreshToken: "refresh-token",
      issuedAt,
    }

    assert.deepStrictEqual(parsePendingLoginChallenge(state), state)
  })

  test("rejects legacy and unversioned challenge shapes", () => {
    assert.strictEqual(
      parsePendingLoginChallenge({
        method: "email",
        email: "firstlast@gmail.com",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        issuedAt,
      }),
      null
    )

    assert.strictEqual(
      parsePendingLoginChallenge(JSON.stringify({
        version: 1,
        method: "email",
        canonicalEmail: "firstlast@gmail.com",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        issuedAt,
      })),
      null
    )
  })

  test("rejects noncanonical email state and mixed email/phone fields", () => {
    assert.strictEqual(
      parsePendingLoginChallenge({
        version: 1,
        method: "email",
        canonicalEmail: "First.Last+tag@googlemail.com",
        recipientEmail: "First.Last+tag@googlemail.com",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        issuedAt,
      }),
      null
    )

    assert.strictEqual(
      parsePendingLoginChallenge({
        version: 1,
        method: "phone",
        phone: "+213555123456",
        canonicalEmail: "firstlast@gmail.com",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        issuedAt,
      }),
      null
    )
  })

  test("rejects missing credentials, unknown fields, and invalid timestamps", () => {
    assert.strictEqual(
      parsePendingLoginChallenge({
        version: 1,
        method: "email",
        canonicalEmail: "firstlast@gmail.com",
        recipientEmail: "First.Last+login@GoogleMail.com",
        accessToken: "access-token",
        issuedAt,
      }),
      null
    )

    assert.strictEqual(
      parsePendingLoginChallenge({
        version: 1,
        method: "email",
        canonicalEmail: "firstlast@gmail.com",
        recipientEmail: "First.Last+login@GoogleMail.com",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        issuedAt: "not-a-date",
        unexpected: true,
      }),
      null
    )

    assert.strictEqual(
      parsePendingLoginChallenge({
        version: 1,
        method: "email",
        canonicalEmail: "firstlast@gmail.com",
        recipientEmail: "other@example.test",
        accessToken: "access-token",
        refreshToken: "refresh-token",
        issuedAt,
      }),
      null
    )
  })
})
