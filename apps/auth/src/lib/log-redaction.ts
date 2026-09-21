/**
 * Centralized Log & Telemetry Redaction Engine
 *
 * Ensures PII (emails, phone numbers), credentials (passwords, tokens, cookies, secrets),
 * database URLs, and provider infrastructure details are never dumped into console logs,
 * Sentry extras, or client responses.
 */

const SAFE_ALLOWLIST_KEYS = new Set([
  "identifierhash",
  "emailhash",
  "phonehash",
  "targetidhash",
  "userhash",
  "failurecode",
  "operation",
  "provider",
  "status",
  "correlationid",
  "path",
  "timestamp",
  "event",
  "level",
  "ts",
  "env",
  "attempt",
  "type",
  "method",
  "layer",
  "namespace",
  "tenantscope",
])

const SENSITIVE_KEY_SUBSTRINGS = [
  "password",
  "token",
  "secret",
  "key",
  "credential",
  "authorization",
  "cookie",
  "session",
  "cert",
  "phone",
  "otp",
  "access",
  "refresh",
  "bearer",
]

const EXACT_CODE_KEYS = new Set([
  "code",
  "otpcode",
  "otp_code",
  "resetcode",
  "reset_code",
  "verificationcode",
  "verification_code",
])

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()

  // Safe allowlist keys bypass key-name masking (their values are still sanitized via regex)
  if (SAFE_ALLOWLIST_KEYS.has(lower)) {
    return false
  }

  // Exact code keys (prevents accidental masking of failureCode or statusCode)
  if (EXACT_CODE_KEYS.has(lower)) {
    return true
  }

  // Substring hash check (unless in safe allowlist)
  if (lower.includes("hash")) {
    return true
  }

  return SENSITIVE_KEY_SUBSTRINGS.some((sub) => lower.includes(sub))
}

/**
 * Regex-scrub sensitive values from strings (emails, phones, JWTs, DB/provider URLs, credentials).
 */
export function sanitizeStringValue(str: string): string {
  if (typeof str !== "string") return str

  let cleaned = str.slice(0, 500)

  // 1. Redact DB connection strings
  cleaned = cleaned.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DB_URL]")

  // 2. Redact Provider infrastructure URLs (Supabase, Upstash, Resend, Infobip)
  cleaned = cleaned.replace(
    /https?:\/\/[a-zA-Z0-9_.-]+\.(?:supabase\.co|upstash\.io|infobip\.com|resend\.com)[^\s]*/gi,
    "[REDACTED_PROVIDER_URL]"
  )

  // 3. Redact JWT tokens
  cleaned = cleaned.replace(
    /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]*/g,
    "[REDACTED_JWT]"
  )

  // 4. Redact API keys / tokens / bearer with label preservation
  cleaned = cleaned.replace(
    /(bearer|api[_-]?key|secret|service_role|access_token|refresh_token)\s*[:=]\s*[^\s,;]+/gi,
    "$1=[REDACTED]"
  )

  // 5. Redact Email addresses
  cleaned = cleaned.replace(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
    "[REDACTED_EMAIL]"
  )

  // 6. Redact Phone numbers (E.164 international with +, Algerian national, or dashed formats)
  cleaned = cleaned.replace(
    /(?:\+[1-9]\d{6,14}\b|\b0[5-7]\d{8}\b|\b\d{3}[-.]\d{3}[-.]\d{4}\b)/g,
    "[REDACTED_PHONE]"
  )

  // 7. Redact 6-digit verification codes in text context
  cleaned = cleaned.replace(
    /(?:code|otp|token|pin)\s*[:=]?\s*(\b\d{6}\b)/gi,
    "code=[REDACTED_CODE]"
  )

  return cleaned
}

/**
 * Recursively redacts an arbitrary payload for safe logging and telemetry.
 * Depth-bounded (max depth 4), array-length capped (50), circular-ref safe.
 */
export function redactLogPayload(payload: unknown, depth = 0, seen = new WeakSet()): unknown {
  if (payload === null || payload === undefined) {
    return payload
  }

  if (typeof payload === "string") {
    return sanitizeStringValue(payload)
  }

  if (typeof payload === "number" || typeof payload === "boolean") {
    return payload
  }

  if (depth > 4) {
    return "[MAX_DEPTH_REACHED]"
  }

  if (typeof payload === "object") {
    if (seen.has(payload)) {
      return "[CIRCULAR_REFERENCE]"
    }
    seen.add(payload)

    // Handle standard Error instances
    if (payload instanceof Error) {
      return {
        name: payload.name,
        message: sanitizeStringValue(payload.message),
        stack: payload.stack ? sanitizeStringValue(payload.stack.split("\n").slice(0, 3).join("\n")) : undefined,
      }
    }

    if (Array.isArray(payload)) {
      return payload.slice(0, 50).map((item) => redactLogPayload(item, depth + 1, seen))
    }

    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(payload)) {
      if (isSensitiveKey(key)) {
        result[key] = "[REDACTED]"
      } else {
        result[key] = redactLogPayload(value, depth + 1, seen)
      }
    }
    return result
  }

  return String(payload)
}
