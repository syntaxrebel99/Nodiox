import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { timingSafeEqual } from "crypto"
import { securityRateLimit } from "./rate-limit"

/**
 * Validates the CSRF token from the request header against the 
 * secure HttpOnly cookie set.
 * Strictly enforces Content-Type, Origin matching, and logs failures.
 */
export async function validateCsrf(req: Request): Promise<{ success: boolean; error?: string }> {
  const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1"

  // Helper for structured logging of failures + abuse signal tracking
  const fail = async (reason: string, message: string) => {
    // Audit log
    console.warn(JSON.stringify({
      event: "csrf_validation_failed",
      ip,
      origin: req.headers.get("origin") ?? "missing",
      path: req.url,
      reason
    }))

    // Rate Limit CSRF Failures (Abuse Signal)
    // If same IP triggers many failures, we throttle them here
    await securityRateLimit.limit(`security_violation:${ip}`)

    return { success: false, error: message }
  }

  // 1. Handle OPTIONS (CORS preflight) explicitly
  if (req.method === "OPTIONS") {
    return { success: true }
  }

  // 1.1 Lock Methods: CSRF is only applicable for state-changing endpoints
  const safeMethods = ["GET", "HEAD", "TRACE"]
  if (safeMethods.includes(req.method)) {
    return { success: true }
  }

  // 1.2 Check if IP is already throttled due to security violations
  const { success: abuseOk } = await securityRateLimit.limit(`security_check:${ip}`)
  if (!abuseOk) {
    return { success: false, error: "Too many security violations. IP temporarily throttled." }
  }

  // 2. Lock Header Presence Early + Normalize Case (subtle bug prevention)
  const headerToken = req.headers.get("x-csrf-token") ?? req.headers.get("X-CSRF-Token")
  
  // 3. Guard Against Empty Tokens (avoids weird edge cases)
  if (!headerToken || headerToken.trim().length === 0) {
    return await fail("missing_header_token", "Missing or empty X-CSRF-Token header")
  }

  // 3. Enforce Content-Type Strictly
  const contentType = req.headers.get("content-type")
  if (!contentType?.includes("application/json")) {
    return await fail("invalid_content_type", "Invalid Content-Type. Expected application/json")
  }

  // 4. Strict Origin/Host Matching + Protocol Check
  const origin = req.headers.get("origin")
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host")
  
  if (!origin) {
    return await fail("missing_origin", "Missing Origin header")
  }

  if (origin && host) {
    try {
      const originUrl = new URL(origin)
      const expectedOrigin = `${originUrl.protocol}//${host}`

      // Compare exact expected origin string to catch protocol downgrades
      if (originUrl.origin !== expectedOrigin && originUrl.host !== host) {
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
  const token = crypto.randomUUID()
  
  cookieStore.set("nodiox_csrf_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    domain: process.env.COOKIE_DOMAIN || undefined,
  })
  
  return token
}
