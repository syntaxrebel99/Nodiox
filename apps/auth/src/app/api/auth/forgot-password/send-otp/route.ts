import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { otpRateLimit } from "~/lib/rate-limit"
import { EmailService } from "~/lib/email-service"
import { createAdminClient } from "~/lib/supabase/admin"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

export async function POST(req: Request) {
  try {
    // 0. CSRF Validation
    const csrfResult = await validateCsrf(req)
    if (!csrfResult.success) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 })
    }

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
    const result = forgotPasswordSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid email format", details: result.error.issues },
        { status: 400 }
      )
    }

    const { email } = result.data
    const ua = req.headers.get("user-agent") || undefined

    // 3. ACCOUNT ENUMERATION PROTECTION:
    // Check if the user actually exists in Supabase.
    // If NOT, we still return 'Success' but don't actually trigger the email.
    const admin = createAdminClient()
    const { data: userExists, error: rpcError } = await admin.rpc("check_user_exists", { 
      email_input: email 
    })
    
    if (rpcError) {
      console.error("RPC Error checking user existence:", rpcError)
    }

    // 4. Get Locale from Cookie (NEXT_LOCALE)
    const cookieStore = await cookies()
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"

    try {
      if (userExists) {
        // Only send the real email if the user is in our system
        await EmailService.sendOtp(email, "forgot_password", locale)
      } else {
        // Optional: Add a small artificial delay to match the timing of a real send
        await new Promise(resolve => setTimeout(resolve, Math.random() * 500 + 400))
        console.log(`[Security] Ghost OTP request for non-existent email: ${email}`)
      }
      
      // Always return the exact same success message
      return NextResponse.json({ 
        success: true,
        message: "A verification code has been sent to your email."
      })
    } catch (error: any) {
      console.error("Forgot OTP Error:", error)
      return NextResponse.json(
        { error: error.message || "Failed to send verification code" },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error("Forgot OTP Critical Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
