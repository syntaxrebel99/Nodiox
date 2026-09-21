import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { redactLogPayload, sanitizeStringValue } from "../../lib/log-redaction.ts"

describe("Centralized Log Redaction Engine", () => {
  test("redacts sensitive keys by pattern", () => {
    const sensitive = {
      password: "SuperSecretPassword123!",
      userToken: "token_abc123",
      cookieHeader: "nodiox_session=active",
      clientSecret: "sec_999",
      bearerToken: "abc-def",
      access_token: "xyz",
      refresh_token: "xyz2",
      phone: "+213555123456",
      otpCode: "654321",
      code: "123456",
    }

    const redacted = redactLogPayload(sensitive) as Record<string, unknown>
    for (const key of Object.keys(sensitive)) {
      assert.strictEqual(redacted[key], "[REDACTED]", `Key '${key}' should be redacted`)
    }
  })

  test("preserves safe telemetry and pseudonymous hash keys", () => {
    const telemetry = {
      failureCode: "mfa_send_failed",
      provider: "supabase",
      operation: "admin_create_user",
      identifierHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      emailHash: "a1b2c3d4e5f6",
      phoneHash: "9876543210ab",
      status: 401,
      correlationId: "req-12345",
    }

    const redacted = redactLogPayload(telemetry) as Record<string, unknown>
    assert.strictEqual(redacted.failureCode, "mfa_send_failed")
    assert.strictEqual(redacted.provider, "supabase")
    assert.strictEqual(redacted.operation, "admin_create_user")
    assert.strictEqual(redacted.identifierHash, "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    assert.strictEqual(redacted.emailHash, "a1b2c3d4e5f6")
    assert.strictEqual(redacted.phoneHash, "9876543210ab")
    assert.strictEqual(redacted.status, 401)
    assert.strictEqual(redacted.correlationId, "req-12345")
  })

  test("enforces defense-in-depth: scrubs raw email values even in allowlisted hash keys", () => {
    const mistakenlyPassed = {
      identifierHash: "user@example.com",
    }

    const redacted = redactLogPayload(mistakenlyPassed) as Record<string, unknown>
    assert.strictEqual(redacted.identifierHash, "[REDACTED_EMAIL]")
  })

  test("sanitizes string values for emails, phones, DB URLs, provider URLs, and credentials", () => {
    // 1. Email
    assert.strictEqual(
      sanitizeStringValue("Failed to send message to user.name+tag@example.co.uk"),
      "Failed to send message to [REDACTED_EMAIL]"
    )

    // 2. Phone
    assert.strictEqual(
      sanitizeStringValue("SMS delivery failed for +213555123456"),
      "SMS delivery failed for [REDACTED_PHONE]"
    )

    // 3. Database URL
    assert.strictEqual(
      sanitizeStringValue("Connection failed at postgresql://postgres:mypassword@db.supabase.co:5432/main"),
      "Connection failed at [REDACTED_DB_URL]"
    )

    // 4. Provider URLs (Supabase, Upstash, Resend, Infobip)
    assert.strictEqual(
      sanitizeStringValue("Upstash timeout at https://eu1-active-panda-12345.upstash.io/get"),
      "Upstash timeout at [REDACTED_PROVIDER_URL]"
    )
    assert.strictEqual(
      sanitizeStringValue("Resend API rejected https://api.resend.com/emails"),
      "Resend API rejected [REDACTED_PROVIDER_URL]"
    )
    assert.strictEqual(
      sanitizeStringValue("Infobip API call to https://api.infobip.com/sms/2/text/advanced"),
      "Infobip API call to [REDACTED_PROVIDER_URL]"
    )

    // 5. JWT token
    assert.strictEqual(
      sanitizeStringValue("Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThisSignature"),
      "Bearer [REDACTED_JWT]"
    )

    // 6. API Key with capturing group
    assert.strictEqual(
      sanitizeStringValue("Failed with api_key=re_123456789 and secret=super_secret"),
      "Failed with api_key=[REDACTED] and secret=[REDACTED]"
    )
  })

  test("sanitizes complex Error instances from Supabase, Resend, and Infobip", () => {
    // Supabase simulation
    const supabaseError = new Error(
      "Query failed on relation auth.users at postgres://postgres:pw@db.supabase.co:5432/db for user john@nodiox.com"
    )
    const redactedSupabase = redactLogPayload(supabaseError) as { message: string }
    assert.strictEqual(
      redactedSupabase.message,
      "Query failed on relation auth.users at [REDACTED_DB_URL] for user [REDACTED_EMAIL]"
    )

    // Resend simulation
    const resendError = new Error(
      "Resend call failed on https://api.resend.com/emails with api_key=re_abcdef for target recipient@nodiox.com"
    )
    const redactedResend = redactLogPayload(resendError) as { message: string }
    assert.strictEqual(
      redactedResend.message,
      "Resend call failed on [REDACTED_PROVIDER_URL] with api_key=[REDACTED] for target [REDACTED_EMAIL]"
    )

    // Infobip simulation
    const infobipError = new Error(
      "Infobip POST https://api.infobip.com/sms/2 failed for recipient +213555987654 bearer=token_12345"
    )
    const redactedInfobip = redactLogPayload(infobipError) as { message: string }
    assert.strictEqual(
      redactedInfobip.message,
      "Infobip POST [REDACTED_PROVIDER_URL] failed for recipient [REDACTED_PHONE] bearer=[REDACTED]"
    )
  })

  test("safely handles circular references and deep nesting", () => {
    const circular: Record<string, unknown> = {
      level: 1,
      nested: {},
    }
    circular.self = circular

    const redacted = redactLogPayload(circular) as Record<string, unknown>
    assert.strictEqual(redacted.level, 1)
    assert.strictEqual(redacted.self, "[CIRCULAR_REFERENCE]")

    // Deep nesting
    let deep: Record<string, unknown> = { val: "end" }
    for (let i = 0; i < 6; i++) {
      deep = { child: deep }
    }
    const redactedDeep = redactLogPayload(deep)
    const str = JSON.stringify(redactedDeep)
    assert.ok(str.includes("[MAX_DEPTH_REACHED]"))
  })

  test("logger.error and securityLog output to console is thoroughly sanitized", async () => {
    const { logger } = await import("../../lib/logger.ts")
    const { securityLog } = await import("../../lib/security-log.ts")

    const loggedLines: string[] = []
    const originalConsoleError = console.error
    console.error = (...args: unknown[]) => {
      loggedLines.push(args.map(String).join(" "))
    }

    try {
      // 1. Logger.error with raw error containing DB URL and email
      logger.error("test_db_error", new Error("postgres://user:pass@db.supabase.co:5432/main error with test@example.com"))

      // 2. securityLog with raw credentials and SMS phone
      securityLog("error", "sms_send_retry", {
        phone: "+213555123456",
        apiKey: "re_1234567890",
        error: "Failed to send to target@example.com",
      })

      const combinedLogs = loggedLines.join("\n")

      // Verify no raw sensitive data leaked
      assert.doesNotMatch(combinedLogs, /postgres:\/\/user:pass/)
      assert.doesNotMatch(combinedLogs, /test@example\.com/)
      assert.doesNotMatch(combinedLogs, /target@example\.com/)
      assert.doesNotMatch(combinedLogs, /\+213555123456/)
      assert.doesNotMatch(combinedLogs, /re_1234567890/)

      // Verify redaction tags are present
      assert.match(combinedLogs, /\[REDACTED_DB_URL\]/)
      assert.match(combinedLogs, /\[REDACTED_EMAIL\]/)
      assert.match(combinedLogs, /\[REDACTED\]/)
    } finally {
      console.error = originalConsoleError
    }
  })

  test("securityLog sends only sanitized extras to Sentry", async () => {
    const { createSecurityLogger } = await import("../../lib/security-log.ts")
    const extras: Record<string, unknown> = {}
    const tags: Record<string, string> = {}
    const capturedMessages: Array<{ message: string, level: string }> = []
    const originalConsoleError = console.error
    console.error = () => {}

    const securityLog = createSecurityLogger({
      withScope(callback) {
        callback({
          setTag(key, value) {
            tags[key] = value
          },
          setExtra(key, value) {
            extras[key] = value
          },
        })
      },
      captureMessage(message, level) {
        capturedMessages.push({ message, level })
      },
    })

    try {
      securityLog("error", "provider_failure", {
        apiKey: "re_1234567890",
        phone: "+213555123456",
        error: new Error("postgres://user:pass@db.supabase.co:5432/main failed for test@example.com"),
      })

      const serializedExtras = JSON.stringify(extras)
      assert.doesNotMatch(serializedExtras, /postgres:\/\/user:pass/)
      assert.doesNotMatch(serializedExtras, /test@example\.com/)
      assert.doesNotMatch(serializedExtras, /\+213555123456/)
      assert.doesNotMatch(serializedExtras, /re_1234567890/)
      assert.match(serializedExtras, /\[REDACTED_DB_URL\]/)
      assert.match(serializedExtras, /\[REDACTED_EMAIL\]/)
      assert.strictEqual(extras.apiKey, "[REDACTED]")
      assert.strictEqual(extras.phone, "[REDACTED]")
      assert.deepStrictEqual(tags, {
        category: "security",
        "security.event": "provider_failure",
      })
      assert.deepStrictEqual(capturedMessages, [
        { message: "security:provider_failure", level: "error" },
      ])
    } finally {
      console.error = originalConsoleError
    }
  })

  test("test simulations require a secret and are inert in production", async () => {
    const { getAuthTestSimulation } = await import("../../lib/test-simulation.ts")
    const mutableEnv = process.env as Record<string, string | undefined>
    const originalEnvironment = {
      NODE_ENV: mutableEnv.NODE_ENV,
      AUTH_TEST_SIMULATION: mutableEnv.AUTH_TEST_SIMULATION,
      AUTH_TEST_SIMULATION_SECRET: mutableEnv.AUTH_TEST_SIMULATION_SECRET,
    }
    const secret = "a".repeat(32)
    const request = new Request("https://auth.nodiox.com/api/auth/login", {
      headers: {
        "x-test-simulate-error": "redis-down",
        "x-auth-test-simulation-secret": secret,
      },
    })

    try {
      mutableEnv.AUTH_TEST_SIMULATION = "1"
      mutableEnv.AUTH_TEST_SIMULATION_SECRET = secret
      mutableEnv.NODE_ENV = "production"
      assert.strictEqual(getAuthTestSimulation(request), null)

      mutableEnv.NODE_ENV = "test"
      assert.strictEqual(
        getAuthTestSimulation(new Request(request.url, {
          headers: { "x-test-simulate-error": "redis-down" },
        })),
        null
      )
      assert.strictEqual(getAuthTestSimulation(request), "redis-down")
      assert.strictEqual(
        getAuthTestSimulation(new Request(request.url, {
          headers: {
            "x-test-simulate-error": "unknown-down",
            "x-auth-test-simulation-secret": secret,
          },
        })),
        null
      )
    } finally {
      for (const [key, value] of Object.entries(originalEnvironment)) {
        if (value === undefined) delete mutableEnv[key]
        else mutableEnv[key] = value
      }
    }
  })

  test("mapAuthErrorCode avoids account-state enumeration", async () => {
    const { mapAuthErrorCode, normalizeFailureCode } = await import("../../lib/security-response.ts")

    // Account exists must not disclose existence
    assert.strictEqual(
      mapAuthErrorCode("user_already_exists", "User already registered"),
      "Unable to complete registration. Please try again."
    )
    assert.strictEqual(
      mapAuthErrorCode("email_exists", "Email already exists in database"),
      "Unable to complete registration. Please try again."
    )

    // Password policy
    assert.strictEqual(
      mapAuthErrorCode("weak_password", "Password is too weak"),
      "Password does not meet security requirements"
    )

    // Invalid credentials
    assert.strictEqual(
      mapAuthErrorCode("invalid_credentials", "Invalid login credentials"),
      "Invalid email or password"
    )

    // Code normalization
    assert.strictEqual(normalizeFailureCode("user_already_exists"), "user_exists")
    assert.strictEqual(normalizeFailureCode("weak_password"), "weak_password")
    assert.strictEqual(normalizeFailureCode("unknown_provider_code_xyz"), "unexpected_error")
  })

  test("respondError strictly returns { error, correlationId } and correct status", async () => {
    const { respondError } = await import("../../lib/security-response.ts")

    const req = new Request("https://auth.nodiox.com/api/auth/login", {
      headers: { "x-request-id": "corr-test-123" },
    })

    const response = respondError(req, 401, "Invalid credentials", {
      failureCode: "invalid_credentials",
      provider: "supabase",
    })

    assert.strictEqual(response.status, 401)
    const body = await response.json()
    assert.deepStrictEqual(body, {
      error: "Invalid credentials",
      correlationId: "corr-test-123",
    })
    // Ensure no unexpected fields exist
    assert.strictEqual(Object.keys(body).length, 2)
  })
})
