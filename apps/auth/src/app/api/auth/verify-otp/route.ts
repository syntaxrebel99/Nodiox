import { NextResponse } from "next/server"
import { createClient } from "~/lib/supabase/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, otpVerifyLimiters } from "~/lib/rate-limit"
import { z } from "zod"
import type { EmailOtpType, MobileOtpType } from "@supabase/supabase-js"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { redisClient, hashIdentifier } from "~/lib/rate-limit"
import { respondError } from "~/lib/security-response"

import { normalizeEmail } from "~/lib/normalize-email"

const verifyOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
  token: z.string().min(6),
  type: z.enum(["signup", "sms", "email"]),
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

    // 1. Validate Body First (so we can extract identifiers for limits)
    const body = await req.json()
    const result = verifyOtpSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request format", details: result.error.issues },
        { status: 400 }
      )
    }

    let { email, phone, token, type } = result.data

    // Normalize email if provided
    if (email) {
      email = normalizeEmail(email)
    }

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: otpVerifyLimiters,
        req,
        identifier: email || phone,
        namespace: "otp_verify"
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 429 })
    }

    // 3. Init Supabase Clients
    const supabase = await createClient()

    // 4. Handle Email OTP (Resend Engine)
    if (type === "email" || type === "signup") {
      if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })

      // a) Verify our custom OTP from the DB (using the corresponding type)
      const otpType = type === "signup" ? "signup" : "login_mfa"
      const { success: isVerified, error: verifyError } = await EmailService.verifyOtp(email, token, otpType)

      if (!isVerified) {
        return NextResponse.json(
          { error: verifyError || "Invalid or expired verification code" },
          { status: 401 }
        )
      }

      // b) If Verified -> Establish Session or Verification State
      if (type === "signup") {
        // For signup, we don't have a user yet. We set a secure cookie to authorize the 'set-password' step.
        const response = NextResponse.json({ success: true, message: "Email verified. Please set your password." })

        // Use an opaque, short-lived token (no PII in cookie). Email is stored server-side in Redis for 15m.
        const signupToken = crypto.randomUUID()
        const signupTokenHash = hashIdentifier("signup_token", signupToken)
        await redisClient.set(`@nodiox/signup_token:${signupTokenHash}`, email, { ex: 60 * 15 })

        response.cookies.set("nodiox_signup_token", signupToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 900, // 15 minutes
          path: "/",
        })
        
        // CSRF Token Rotation on successful signup verification
        const newCsrf = await rotateCsrfToken()
        response.headers.set("x-csrf-token", newCsrf)
        
        return response
      }

      // c) For Login MFA -> Bridge to a real Supabase session
      const adminClient = createAdminClient()
      const { data: { properties }, error: linkError } = await adminClient.auth.admin.generateLink({
        type: "magiclink",
        email,
      })

      if (linkError || !properties?.email_otp) {
        console.error("MFA Bridge Error:", linkError)
        return NextResponse.json(
          { error: "Failed to establish secure session. Please try again." },
          { status: 500 }
        )
      }

      const { data: verifyData, error: finalError } = await supabase.auth.verifyOtp({
        email,
        token: properties.email_otp,
        type: "magiclink",
      })

      if (finalError) {
        return NextResponse.json({ error: finalError.message }, { status: 401 })
      }

      // CSRF Token Rotation on successful MFA login
      const newCsrf = await rotateCsrfToken()
      const response = NextResponse.json({ success: true, user: verifyData.user })
      response.headers.set("x-csrf-token", newCsrf)
      return response
    }

    // 5. Handle Phone OTP (Existing Supabase Flow)
    const options: any = {
      token,
      type: type as EmailOtpType | MobileOtpType,
    }
    if (email) options.email = email
    if (phone) options.phone = phone

    const { data, error } = await supabase.auth.verifyOtp(options)

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status || 401 }
      )
    }

    // CSRF Token Rotation on successful OTP verification (Phone flow)
    const newCsrf = await rotateCsrfToken()

    // If successful, Supabase automatically establishes a session cookie 
    // via our @supabase/ssr server client's `setAll` implementation.
    const response = NextResponse.json({ success: true, user: data.user })
    response.headers.set("x-csrf-token", newCsrf)
    return response
  } catch (error: any) {
    console.error("Verify OTP Error:", error)
    return respondError(req, 500, "An unexpected error occurred")
  }
}
