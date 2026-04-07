import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { EmailService } from "~/lib/email-service"
import { createAdminClient } from "~/lib/supabase/admin"
import { otpRateLimit } from "~/lib/rate-limit"
import { z } from "zod"

const sendOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().min(5).optional(),
}).refine(data => data.email || data.phone, {
  message: "Either email or phone is required",
})

export async function POST(req: Request) {
  try {
    // 1. Rate Limiting via IP
    const ip = req.headers.get("x-forwarded-for") ?? "127.0.0.1"
    const { success } = await otpRateLimit.limit(ip)
    
    if (!success) {
      return NextResponse.json(
        { error: "Too many requests. Please try again later." },
        { status: 429 }
      )
    }

    // 2. Validate Request Body
    const body = await req.json()
    const result = sendOtpSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request format", details: result.error.issues },
        { status: 400 }
      )
    }

    const { email } = result.data

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
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
