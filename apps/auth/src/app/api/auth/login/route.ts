import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, loginLimiters } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"

import { normalizeEmail } from "~/lib/normalize-email"

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(1),
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

    // 1. Validate Request Body
    const body = await req.json()
    const result = loginSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request format", details: result.error.issues },
        { status: 400 }
      )
    }

    let { email, phone, password } = result.data

    // Normalize email if provided
    if (email) {
      email = normalizeEmail(email)
    }

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: loginLimiters,
        req,
        identifier: email || phone,
        namespace: "login"
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 429 })
    }

    // 3. Init Supabase Client
    const supabase = await createClient()

    // 4. Verify Password First
    const creds: any = { password }
    if (email) creds.email = email
    if (phone) creds.phone = phone

    const { error: signInError } = await supabase.auth.signInWithPassword(creds)

    if (signInError) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    // CSRF Token Rotation on successful credentials validation
    const newToken = await rotateCsrfToken()

    // 5. If password OK -> Send OTP for Factor 2 via Universal Resend Engine
    try {
      if (email) {
        const cookieStore = await cookies()
        const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"
        await EmailService.sendOtp(email, "login_mfa", locale)
      } else if (phone) {
        // For now, phone still uses Supabase as we haven't integrated a custom SMS provider
        const { error: otpError } = await supabase.auth.signInWithOtp({ 
          phone, 
          options: { shouldCreateUser: false } 
        })
        if (otpError) throw otpError
      }

      const response = NextResponse.json({ success: true, mfaRequired: true })
      response.headers.set("x-csrf-token", newToken)
      return response
    } catch (error: any) {
      console.error("Login MFA Send Error:", error)
      return NextResponse.json(
        { error: error.message || "Failed to send verification code" },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("Login Error:", error)
    return respondError(req, 500, "An unexpected error occurred")
  }
}
