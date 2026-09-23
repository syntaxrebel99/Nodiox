import assert from "node:assert/strict"
import { describe, test } from "node:test"

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3001"
const ORIGIN = new URL(BASE_URL).origin

const csrfHeaders = {
  "Content-Type": "application/json",
  Origin: ORIGIN,
  "x-csrf-token": "test-csrf-token",
  Cookie: "nodiox_csrf_token=test-csrf-token",
  "x-forwarded-for": "198.51.100.150",
}

async function expectInvalidCanonicalIdentity(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: csrfHeaders,
    body: JSON.stringify(body),
  })

  assert.equal(response.status, 400, path)
  assert.equal((await response.json()).error, "Invalid request format", path)
}

describe("API: permanent email identity validation", () => {
  test("rejects a Gmail alias that canonicalizes to an empty local part before any provider work", async () => {
    await expectInvalidCanonicalIdentity("/api/auth/login", {
      email: "+tag@gmail.com",
      password: "Password123!",
    })
    await expectInvalidCanonicalIdentity("/api/auth/send-otp", {
      email: "+tag@gmail.com",
    })
    await expectInvalidCanonicalIdentity("/api/auth/verify-otp", {
      email: "+tag@gmail.com",
      token: "123456",
      type: "signup",
    })
    await expectInvalidCanonicalIdentity("/api/auth/forgot-password/send-otp", {
      email: "+tag@gmail.com",
    })
    await expectInvalidCanonicalIdentity("/api/auth/forgot-password/verify-otp", {
      email: "+tag@gmail.com",
      token: "123456",
    })
  })

  test("does not accept a plaintext reset code as a completion fallback", async () => {
    const response = await fetch(`${BASE_URL}/api/auth/reset-password/complete`, {
      method: "POST",
      headers: csrfHeaders,
      body: JSON.stringify({
        code: "legacy-plaintext-token",
        password: "Password123!",
      }),
    })

    assert.equal(response.status, 400)
    assert.equal((await response.json()).error, "Invalid request format")
  })
})
