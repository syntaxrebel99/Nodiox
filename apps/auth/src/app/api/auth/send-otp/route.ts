import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { EmailService } from "~/lib/email-service"
import { createAdminClient } from "~/lib/supabase/admin"
import { enforceAuthRateLimits, otpSendLimiters, otpSendCooldownLimit } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"

import { normalizeEmail } from "~/lib/normalize-email"

const sendOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
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

    let { email, phone } = result.data

    // Normalize email if provided
    if (email) {
      email = normalizeEmail(email)
    }

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
          await EmailService.sendSignupAttemptAlert(email, locale)
        } else {
          // New user -> send standard signup OTP
          await EmailService.sendOtp(email, "signup", locale)
        }
      }
      // Note: Phone is currently not handled by custom Resend Engine
      
      return NextResponse.json({ success: true })
    } catch (error: any) {
      console.error("Signup OTP Send Error:", error)
      return NextResponse.json(
        { error: error.message || "Failed to send verification email" },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("OTP Error:", error)
    return respondError(req, 500, "An unexpected error occurred")
  }
}
