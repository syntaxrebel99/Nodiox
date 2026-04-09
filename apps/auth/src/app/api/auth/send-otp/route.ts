import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { EmailService } from "~/lib/email-service"
import { createAdminClient } from "~/lib/supabase/admin"
import { enforceAuthRateLimits, otpSendLimiters, otpSendCooldownLimit } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import { SmsService } from "~/lib/sms-service"
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
      return NextResponse.json({ error: csrfResult.error }, { status: 403 })
    }

    // 1. Validate Request Body First (so we can get identifier for limits)
    const body = await req.json()
    const result = sendOtpSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request format", details: result.error.issues },
        { status: 400 }
      )
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
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 429 })
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
    } catch (error: any) {
      console.error("Signup OTP Send Error:", error)
      return NextResponse.json(
        { error: error.message || "Failed to send verification code" },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("OTP Error:", error)
    return respondError(req, 500, "An unexpected error occurred")
  }
}
