import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { describe, test } from "node:test"

import type { AuthEnv } from "../../lib/env.ts"

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "test-upstash-token",
  RESEND_API_KEY: "test-resend-key",
  OTP_PEPPER: "test-otp-pepper-1234567890",
  AUTH_SMS_PROVIDER: "infobip",
  INFOBIP_BASE_URL: "https://sms.example.test/",
  INFOBIP_API_KEY: "test-infobip-key",
  INFOBIP_SMS_SENDER: "TestSender",
}

function parseEnv(overrides: Record<string, string | undefined> = {}): AuthEnv {
  // Each process gets fresh module/cache state and only synthetic configuration.
  const output = execFileSync(process.execPath, [
    "--experimental-strip-types",
    "--input-type=module",
    "--eval",
    `
      import { getAuthEnv } from ${JSON.stringify(new URL("../../lib/env.ts", import.meta.url).href)}
      try {
        process.stdout.write(JSON.stringify({ env: getAuthEnv() }))
      } catch (error) {
        process.stdout.write(JSON.stringify({ error: error.message }))
      }
    `,
  ], {
    env: { ...validEnv, ...overrides },
    encoding: "utf8",
    timeout: 10_000,
    stdio: ["ignore", "pipe", "pipe"],
  })
  const result = JSON.parse(output) as { env: AuthEnv; error?: string }
  if (result.error) {
    throw new Error(result.error)
  }
  return result.env
}

describe("Infobip environment validation", () => {
  for (const NODE_ENV of ["development", "test", "production"]) {
    for (const AUTH_SMS_PROVIDER of ["infobip", "mock", undefined]) {
      const context = `${NODE_ENV}, provider=${AUTH_SMS_PROVIDER ?? "default"}`

      test(`accepts HTTPS (${context})`, () => {
        const env = parseEnv({ NODE_ENV, AUTH_SMS_PROVIDER })
        assert.equal(env.INFOBIP_BASE_URL, validEnv.INFOBIP_BASE_URL)
        assert.equal(env.AUTH_SMS_PROVIDER, AUTH_SMS_PROVIDER ?? "infobip")
      })

      test(`rejects HTTP regardless of scheme case (${context})`, () => {
        for (const INFOBIP_BASE_URL of ["http://sms.example.test", "HTTP://sms.example.test"]) {
          assert.throws(
            () => parseEnv({ NODE_ENV, AUTH_SMS_PROVIDER, INFOBIP_BASE_URL }),
            /INFOBIP_BASE_URL.*HTTPS/
          )
        }
      })
    }

    test(`mock accepts absent or blank Infobip configuration (${NODE_ENV})`, () => {
      for (const value of [undefined, "", " \t\n "]) {
        const env = parseEnv({
          NODE_ENV,
          AUTH_SMS_PROVIDER: "mock",
          INFOBIP_BASE_URL: value,
          INFOBIP_API_KEY: value,
          INFOBIP_SMS_SENDER: value,
        })
        assert.equal(env.AUTH_SMS_PROVIDER, "mock")
        assert.equal(env.INFOBIP_BASE_URL, undefined)
        assert.equal(env.INFOBIP_API_KEY, undefined)
        assert.equal(env.INFOBIP_SMS_SENDER, undefined)
      }
    })
  }

  for (const INFOBIP_BASE_URL of [
    "not a url",
    "https://",
    "sms.example.test",
    "//sms.example.test",
    "ftp://sms.example.test",
    "mailto:sms@example.test",
  ]) {
    test(`rejects invalid or non-HTTPS URL: ${INFOBIP_BASE_URL}`, () => {
      assert.throws(() => parseEnv({ INFOBIP_BASE_URL }), /INFOBIP_BASE_URL.*HTTPS/)
    })
  }

  test("trims whitespace and normalizes an uppercase HTTPS URL", () => {
    assert.equal(
      parseEnv({ INFOBIP_BASE_URL: " \tHTTPS://SMS.EXAMPLE.TEST/gateway/ \n" }).INFOBIP_BASE_URL,
      "https://sms.example.test/gateway/"
    )
  })

  for (const INFOBIP_BASE_URL of [
    "https://sms.example.test",
    "https://sms.example.test/",
    "https://sms.example.test///",
    "https://custom.example.test:8443/gateway",
    "https://localhost",
    "https://127.0.0.1",
    "https://user:password@sms.example.test/gateway?region=test#section",
  ]) {
    test(`preserves HTTPS URL compatibility: ${INFOBIP_BASE_URL}`, () => {
      assert.equal(parseEnv({ INFOBIP_BASE_URL }).INFOBIP_BASE_URL, new URL(INFOBIP_BASE_URL).href)
    })
  }

  for (const field of ["INFOBIP_BASE_URL", "INFOBIP_API_KEY", "INFOBIP_SMS_SENDER"]) {
    test(`Infobip requires nonblank ${field}`, () => {
      for (const value of [undefined, "", " \t\n "]) {
        assert.throws(
          () => parseEnv({ [field]: value }),
          new RegExp(`${field} is required when AUTH_SMS_PROVIDER=infobip`)
        )
      }
    })
  }
})
