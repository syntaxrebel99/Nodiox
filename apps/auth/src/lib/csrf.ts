import { cookies } from "next/headers"
import { randomUUID, timingSafeEqual } from "crypto"
import { securityRateLimit } from "./rate-limit"
import { getCorrelationId, securityLog } from "./security-log"
import { getAuthEnv } from "./env"

/**
 * Validates the CSRF token from the request header against the 
 * secure HttpOnly cookie set.
 * Strictly enforces Content-Type, Origin matching, and logs failures.
 */
export async function validateCsrf(req: Request): Promise<{ success: boolean; error?: string }> {
  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] ?? "127.0.0.1").trim()
  const correlationId = getCorrelationId(req)
  const env = getAuthEnv()
  const shouldBypassSecurityThrottle =
    env.NODE_ENV !== "production" && env.AUTH_DISABLE_RATE_LIMITS

  // Helper for structured logging of failures + abuse signal tracking
  const fail = async (reason: string, message: string) => {
    securityLog("warn", "csrf_validation_failed", {
      correlationId,
      ip,
      origin: req.headers.get("origin") ?? "missing",
      path: req.url,
      reason,
    })

    // Rate Limit CSRF Failures (Abuse Signal)
    // If same IP triggers many failures, we throttle them here
    if (!shouldBypassSecurityThrottle) {
      await securityRateLimit.limit(`security_violation:${ip}`)
    }

    return { success: false, error: message }
  }

  // 1. Handle OPTIONS (CORS preflight) explicitly
  if (req.method === "OPTIONS") {
    return { success: true }
  }

  // 1.1 Lock Methods: CSRF is only applicable for state-changing endpoints
  const safeMethods = ["GET", "HEAD"]
  if (safeMethods.includes(req.method)) {
    return { success: true }
  }

  // 1.2 Check if IP is already throttled due to security violations
  if (!shouldBypassSecurityThrottle) {
    const { success: abuseOk } = await securityRateLimit.limit(`security_check:${ip}`)
    if (!abuseOk) {
      return { success: false, error: "Too many security violations. IP temporarily throttled." }
    }
  }

  // 2. Lock Header Presence Early + Normalize Case (subtle bug prevention)
  const headerToken = req.headers.get("x-csrf-token") ?? req.headers.get("X-CSRF-Token")
  
  // 3. Guard Against Empty Tokens (avoids weird edge cases)
  if (!headerToken || headerToken.trim().length === 0) {
    return await fail("missing_header_token", "Missing or empty X-CSRF-Token header")
  }

  // 3. Enforce Content-Type Strictly
  const contentType = req.headers.get("content-type")
  // Allow standard JSON + vendor JSON, but don't hard-fail for form/multipart unless you
  // intentionally require JSON-only on this route.
  if (contentType && !/application\/json|application\/.+\+json/i.test(contentType)) {
    // If a Content-Type is present and isn't JSON-ish, reject.
    // (If you later add multipart/form-data endpoints, revisit this.)
    return await fail("invalid_content_type", "Invalid Content-Type. Expected application/json")
  }

  // 4. Strict Origin/Host Matching + Protocol Check
  const origin = req.headers.get("origin")
  // Avoid trusting spoofable forwarded headers for security decisions.
  // Use the actual request URL host as the authority.
  const requestUrl = new URL(req.url)
  const host = requestUrl.host
  const forwardedProto = req.headers.get("x-forwarded-proto")
  
  if (!origin) {
    return await fail("missing_origin", "Missing Origin header")
  }

  if (origin && host) {
    try {
      const originUrl = new URL(origin)
      const isProd = process.env.NODE_ENV === "production"
      const expectedProto =
        forwardedProto ??
        (isProd ? "https" : requestUrl.protocol.replace(":", ""))
      const expectedOrigin = `${expectedProto}://${host}`

      // Compare exact expected origin string to catch protocol downgrades
      if (originUrl.origin !== expectedOrigin || originUrl.host !== host) {
        return await fail("origin_mismatch", "Cross-Origin requests are forbidden")
      }
    } catch {
      return await fail("invalid_origin_format", "Invalid Origin header")
    }
  }

  // 5. Double-Submit Cookie Check with Timing-Safe comparison
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get("nodiox_csrf_token")?.value

  if (!cookieToken || cookieToken.trim().length === 0) {
    return await fail("missing_cookie_token", "Missing or empty CSRF cookie")
  }

  const bufA = Buffer.from(headerToken)
  const bufB = Buffer.from(cookieToken)
  
  if (bufA.length !== bufB.length || !timingSafeEqual(bufA, bufB)) {
    return await fail("token_mismatch", "Invalid CSRF token")
  }

  return { success: true }
}

/**
 * Rotates the CSRF token to strictly prevent session fixation.
 * Call this immediately after a user successfully logs in, signs up, or logs out.
 */
export async function rotateCsrfToken() {
  const cookieStore = await cookies()
  const token = randomUUID()
  
  cookieStore.set("nodiox_csrf_token", token, {
    // Option C (Double Submit): must be readable by JS to echo in X-CSRF-Token.
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined,
  })
  
  return token
}
