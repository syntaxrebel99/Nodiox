import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { enforceAuthRateLimits, otpSendLimiters, otpSendCooldownLimit, hashIdentifier } from "~/lib/rate-limit"
import { emailRateLimitIdentifier } from "~/lib/auth-rate-limit-identifier"
import { EmailService } from "~/lib/email-service"
import { createAdminClient } from "~/lib/supabase/admin"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"

import { isCanonicalEmailIdentity, resolveEmailIdentity } from "~/lib/normalize-email"

const forgotPasswordSchema = z.object({
  email: z.string().email(),
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
    const result = forgotPasswordSchema.safeParse(body)
    
    if (!result.success) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    const { email: rawEmail } = result.data

    const { canonicalEmail: email, recipientEmail } = resolveEmailIdentity(rawEmail)

    if (!isCanonicalEmailIdentity(email)) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: [...otpSendLimiters, otpSendCooldownLimit],
        req,
        identifier: emailRateLimitIdentifier(email),
        namespace: "otp_send"
      });
    } catch {
      return respondError(req, 429, "Too many attempts. Please try again later.", {
        failureCode: "rate_limit_exceeded",
      })
    }

    // Strictly gated simulation hooks for automated testing.
    const simulation = getAuthTestSimulation(req)
    if (simulation === "supabase-down") {
      throw new Error("Supabase check_user_exists RPC failed at postgresql://postgres:pw@db.supabase.co:5432/main")
    }
    if (simulation === "notification-down") {
      throw new Error("Resend API rejected delivery with api_key=re_123456789")
    }

    // 3. ACCOUNT ENUMERATION PROTECTION:
    // Check if the user actually exists in Supabase.
    // If NOT, we still return 'Success' but don't actually trigger the email.
    const admin = createAdminClient()
    const { data: userExists, error: rpcError } = await admin.rpc("check_user_exists", {
      email_input: email,
    })
    
    if (rpcError) {
      logger.error("forgot_otp_rpc_error", rpcError)
      return respondError(req, 503, "Authentication service temporarily unavailable", {
        failureCode: "provider_unavailable",
        provider: "supabase",
      })
    }

    // 4. Get Locale from Cookie (NEXT_LOCALE)
    const cookieStore = await cookies()
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"

    try {
      if (userExists) {
        // Only send the real email if the user is in our system
        await EmailService.sendOtp(email, "forgot_password", locale, {
          recipientEmail,
        })
      } else {
        // Optional: Add a small artificial delay to match the timing of a real send
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 400))
        logger.info("ghost_otp_request_for_nonexistent_account", { emailHash: hashIdentifier("email", email) })
      }
      
      // Always return the exact same success message
      return NextResponse.json({ 
        success: true,
        message: "A verification code has been sent to your email."
      })
    } catch (error: unknown) {
      logger.error("forgot_otp_send_failed", error)
      return respondError(req, 500, "Failed to send verification code", {
        failureCode: "otp_send_failed",
        provider: "resend",
        identifierHash: hashIdentifier("email", email),
      })
    }
  } catch (error: unknown) {
    logger.error("forgot_otp_critical_error", error)
    return respondError(req, 500, "An unexpected error occurred", {
      failureCode: "unexpected_error",
    })
  }
}
