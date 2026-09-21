import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { EmailService } from "~/lib/email-service"
import { createAdminClient } from "~/lib/supabase/admin"
import { enforceAuthRateLimits, otpSendLimiters, otpSendCooldownLimit, hashIdentifier } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import { SmsService } from "~/lib/sms-service"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"
import { normalizePhoneNumber, validatePhoneNumber } from "~/lib/phone-validation"

import { normalizeEmail, sanitizeEmail } from "~/lib/normalize-email"

const sendOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().refine((value) => validatePhoneNumber(value, "DZ"), {
    message: "Invalid phone number",
  }).optional(),
}).refine(data => data.email || data.phone, {
  message: "Either email or phone is required",
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
    const recipientEmail = rawEmail ? sanitizeEmail(rawEmail) : undefined
    const email = recipientEmail ? normalizeEmail(recipientEmail) : undefined
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : undefined

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: [...otpSendLimiters, otpSendCooldownLimit], // Enforces 1 per 60s minimum gap + sustained
        req,
        identifier: email || phone,
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
    const admin = createAdminClient()
    const { data: userExists } = await admin.rpc("check_user_exists", { 
      email_input: email 
    })

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
