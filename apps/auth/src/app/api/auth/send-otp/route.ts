import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { EmailService } from "~/lib/email-service"
import { createAdminClient } from "~/lib/supabase/admin"
import { enforceAuthRateLimits, otpSendLimiters, otpSendCooldownLimit, hashIdentifier } from "~/lib/rate-limit"
import { emailRateLimitIdentifier, phoneRateLimitIdentifier } from "~/lib/auth-rate-limit-identifier"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import { SmsService } from "~/lib/sms-service"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"
import { normalizePhoneNumber, validatePhoneNumber } from "~/lib/phone-validation"

import { isCanonicalEmailIdentity, resolveEmailIdentity } from "~/lib/normalize-email"

const sendOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().refine((value) => validatePhoneNumber(value, "DZ"), {
    message: "Invalid phone number",
  }).optional(),
}).refine(data => Boolean(data.email) !== Boolean(data.phone), {
  message: "Provide exactly one email or phone identifier",
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

    // 1. Validate Request Body First (so we can get identifier for limits)
    const body = await req.json()
    const result = sendOtpSchema.safeParse(body)
    
    if (!result.success) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    const { email: rawEmail, phone: rawPhone } = result.data
    const emailIdentity = rawEmail ? resolveEmailIdentity(rawEmail) : undefined
    const recipientEmail = emailIdentity?.recipientEmail
    const email = emailIdentity?.canonicalEmail
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : undefined

    if (email && !isCanonicalEmailIdentity(email)) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: [...otpSendLimiters, otpSendCooldownLimit], // Enforces 1 per 60s minimum gap + sustained
        req,
        identifier: email
          ? emailRateLimitIdentifier(email)
          : phoneRateLimitIdentifier(phone!),
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
    // Check if the user already exists in Supabase.
    let userExists = false
    if (email) {
      const admin = createAdminClient()
      const { data, error } = await admin.rpc("check_user_exists", {
        email_input: email,
      })
      if (error) {
        logger.error("check_user_exists_failed", error)
        return respondError(req, 503, "Authentication service temporarily unavailable", {
          failureCode: "provider_unavailable",
          provider: "supabase",
        })
      }
      userExists = data === true
    }

    // 4. Get Locale from Cookie (NEXT_LOCALE)
    const cookieStore = await cookies()
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"

    // 5. Issue OTP or Security Alert via Universal Resend Engine
    try {
      if (email) {
        if (userExists) {
          // If they already have an account, send the security alert instead of a signup OTP
          await EmailService.sendSignupAttemptAlert(email, locale, {
            recipientEmail,
          })
        } else {
          // New user -> send standard signup OTP
          await EmailService.sendOtp(email, "signup", locale, {
            recipientEmail,
          })
        }
      } else if (phone) {
        await SmsService.sendOtp(phone, "signup", locale)
      }
      
      return NextResponse.json({ success: true })
    } catch (error: unknown) {
      logger.error("signup_otp_send_failed", error)
      return respondError(req, 500, "Failed to send verification code", {
        failureCode: "otp_send_failed",
        provider: email ? "resend" : "infobip",
        identifierHash: email ? hashIdentifier("email", email) : phone ? hashIdentifier("phone", phone) : undefined,
      })
    }
  } catch (error: unknown) {
    logger.error("signup_otp_unexpected_error", error)
    return respondError(req, 500, "An unexpected error occurred", {
      failureCode: "unexpected_error",
    })
  }
}
