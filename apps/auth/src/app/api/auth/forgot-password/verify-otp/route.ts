import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, otpVerifyLimiters, hashIdentifier } from "~/lib/rate-limit"
import { emailRateLimitIdentifier } from "~/lib/auth-rate-limit-identifier"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"
import { isCanonicalEmailIdentity, resolveEmailIdentity } from "~/lib/normalize-email"

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
    const { canonicalEmail: email, recipientEmail } = resolveEmailIdentity(rawEmail)

    if (!isCanonicalEmailIdentity(email)) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: otpVerifyLimiters,
        req,
        identifier: emailRateLimitIdentifier(email),
        namespace: "otp_verify"
      });
    } catch {
      return respondError(req, 429, "Too many attempts. Please try again later.", {
        failureCode: "rate_limit_exceeded",
      })
    }

    // Strictly gated simulation hooks for automated testing.
    if (getAuthTestSimulation(req) === "supabase-down") {
      throw new Error("Supabase reset identity lookup failed")
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

    // 4. Resolve the exact Auth user without creating a session. The RPC is
    // service-role-only and receives an already canonical identity.
    const admin = createAdminClient()
    const { data: authUserId, error: userLookupError } = await admin.rpc(
      "get_auth_user_id_by_canonical_email",
      { email_input: email },
    )

    if (userLookupError) {
      logger.error("forgot_reset_user_lookup_error", userLookupError)
      return respondError(req, 503, "Authentication service temporarily unavailable", {
        failureCode: "provider_unavailable",
        provider: "supabase",
      })
    }

    if (typeof authUserId !== "string" || authUserId.length === 0) {
      return respondError(req, 401, "Invalid or expired verification code", {
        failureCode: "otp_invalid",
        provider: "resend",
      })
    }

    // 5. Bind a one-time reset credential to the canonical identity and Auth
    // user. Upsert replaces a prior reset credential for this user/type.
    const resetToken = randomUUID()
    const resetTokenHash = EmailService.hashResetTokenV1(resetToken)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    const { error: resetRecordError } = await admin.from("verification_codes").upsert({
      email,
      recipient_email: recipientEmail,
      auth_user_id: authUserId,
      code_hash: resetTokenHash,
      code_version: "reset_hmac_sha256_v1",
      type: "reset_token",
      expires_at: expiresAt,
      consumed_at: null,
      attempt_count: 0,
      last_attempt_at: null,
    }, { onConflict: "email,type" })

    if (resetRecordError) {
      logger.error("forgot_reset_token_store_error", resetRecordError)
      return respondError(req, 500, "Failed to establish secure reset", {
        failureCode: "provider_unavailable",
        provider: "supabase",
      })
    }

    const response = NextResponse.json({
      success: true,
      message: "Identity verified! Redirecting to secure reset...",
    })

    // Keep the raw token out of the URL; store it in a short-lived HTTP-only
    // cookie. Completion consumes the corresponding hash exactly once.
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
