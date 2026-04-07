import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { EmailService } from "~/lib/email-service"
import { otpRateLimit } from "~/lib/rate-limit"
import { z } from "zod"

const loginSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().optional(),
  password: z.string().min(1),
}).refine(data => data.email || data.phone, {
  message: "Either email or phone is required",
})

export async function POST(req: Request) {
  try {
    // 1. Rate Limiting via IP (Brute force protection)
    const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1"
    const { success } = await otpRateLimit.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        { error: "Too many login attempts. Please try again later." },
        { status: 429 }
      )
    }

    // 2. Validate Request Body
    const body = await req.json()
    const result = loginSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request format", details: result.error.issues },
        { status: 400 }
      )
    }

    const { email, phone, password } = result.data

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

      return NextResponse.json({ success: true, mfaRequired: true })
    } catch (error: any) {
      console.error("Login MFA Send Error:", error)
      return NextResponse.json(
        { error: error.message || "Failed to send verification code" },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("Login Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
