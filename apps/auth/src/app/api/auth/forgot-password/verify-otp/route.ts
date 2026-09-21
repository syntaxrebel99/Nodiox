import { NextResponse } from "next/server"
import { createClient } from "~/lib/supabase/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, otpVerifyLimiters, hashIdentifier } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"
import { normalizeEmail, sanitizeEmail } from "~/lib/normalize-email"

const RESET_COOKIE = "nodiox_reset_token"

const verifyOtpSchema = z.object({
  email: z.string().email(),
  token: z.string().min(6),
})

export async function POST(req: Request) {
  try {
    // 0. CSRF Validation
    const csrfResult = await validateCsrf(req)
    if (!csrfResult.success) {
      return respondError(req, 403, csrfResult.error || "Forbidden", {
        failureCode: "csrf_rejected",
      })
    }

    // 1. Validate Target First
    const body = await req.json()
    const result = verifyOtpSchema.safeParse(body)
    
    if (!result.success) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    const { email: rawEmail, token } = result.data
    const recipientEmail = sanitizeEmail(rawEmail)
    const email = normalizeEmail(recipientEmail)

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: otpVerifyLimiters,
        req,
        identifier: email,
        namespace: "otp_verify"
      });
    } catch {
      return respondError(req, 429, "Too many attempts. Please try again later.", {
        failureCode: "rate_limit_exceeded",
      })
    }

    // Strictly gated simulation hooks for automated testing.
    if (getAuthTestSimulation(req) === "supabase-down") {
      throw new Error("Supabase generateLink failed at postgresql://postgres:pw@db.supabase.co:5432/main")
    }

    // 3. Verify OTP via Universal Resend Engine
    const { success: isVerified, error: verifyError } = await EmailService.verifyOtp(email, token, "forgot_password")

    if (!isVerified) {
      return respondError(
        req,
        401,
        verifyError || "Invalid or expired verification code",
        {
          failureCode: "otp_invalid",
          provider: "resend",
          identifierHash: hashIdentifier("email", email),
        }
      )
    }

    // 4. Identity Verified! -> Bridge to a real Supabase session
    // We generate a one-time magiclink internally and verify it to set the official cookies.
    const admin = createAdminClient()
    const supabase = await createClient() // Server client with cookie handling
    
    const { data: { properties }, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    })

    if (linkError || !properties?.email_otp) {
      logger.error("forgot_reset_bridge_error", linkError)
      return respondError(req, 500, "Failed to establish secure session. Please try again.", {
        failureCode: "provider_unavailable",
        provider: "supabase",
        identifierHash: hashIdentifier("email", email),
      })
    }

    // Complete the session exchange internally to set the auth cookies
    const { error: finalError } = await supabase.auth.verifyOtp({
      email,
      token: properties.email_otp,
      type: "magiclink",
    })

    if (finalError) {
      logger.error("forgot_reset_verify_error", finalError)
      return respondError(req, 401, "Failed to establish secure session. Please try again.", {
        failureCode: "invalid_credentials",
        provider: "supabase",
        identifierHash: hashIdentifier("email", email),
      })
    }

    // 5. Generate and store a One-Time Reset Token (Double-Lock Security)
    const resetToken = crypto.randomUUID()
    const resetTokenHash = EmailService.hashResetTokenV1(resetToken)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 mins

    await admin.from("verification_codes").insert({
      email,
      // Store only a hash at rest; the raw token is returned to the client once.
      code: `reset_v1.${resetTokenHash}`, // backward compatible storage
      code_hash: resetTokenHash,
      code_version: "reset_hmac_sha256_v1",
      type: "reset_token",
      expires_at: expiresAt,
    })

    const response = NextResponse.json({
      success: true,
      message: "Identity verified! Redirecting to secure reset...",
    })

    // Keep the raw token out of the URL; store it in a short-lived httpOnly cookie instead.
    response.cookies.set(RESET_COOKIE, resetToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 10 * 60, // 10 minutes
    })

    return response

  } catch (error: unknown) {
    logger.error("forgot_verify_otp_reset_error", error)
    return respondError(req, 500, "An unexpected error occurred", {
      failureCode: "unexpected_error",
    })
  }
}
