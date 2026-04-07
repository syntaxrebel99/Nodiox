import { NextResponse } from "next/server"
import { createClient } from "~/lib/supabase/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { otpRateLimit } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf } from "~/lib/csrf"

const verifyOtpSchema = z.object({
  email: z.string().email(),
  token: z.string().min(6),
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
        { error: "Too many attempts. Please try again later." },
        { status: 429 }
      )
    }

    // 2. Validate Request Body
    const body = await req.json()
    const result = verifyOtpSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid email or code format", details: result.error.issues },
        { status: 400 }
      )
    }

    const { email, token } = result.data

    // 3. Verify OTP via Universal Resend Engine
    const { success: isVerified, error: verifyError } = await EmailService.verifyOtp(email, token, "forgot_password")

    if (!isVerified) {
      return NextResponse.json(
        { error: verifyError || "Invalid or expired verification code" },
        { status: 401 }
      )
    }

    // 4. Identity Verified! -> Bridge to a real Supabase session
    // We generate a one-time magiclink internally and verify it to set the official cookies.
    const admin = createAdminClient()
    const supabase = await createClient() // Server client with cookie handling
    
    const { data: { properties }, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    })

    if (linkError || !properties?.email_otp) {
      console.error("Forgot Reset Bridge Error:", linkError)
      return NextResponse.json(
        { error: "Failed to establish secure session. Please try again." },
        { status: 500 }
      )
    }

    // Complete the session exchange internally to set the auth cookies
    const { error: finalError } = await supabase.auth.verifyOtp({
      email,
      token: properties.email_otp,
      type: "magiclink",
    })

    if (finalError) {
      return NextResponse.json({ error: finalError.message }, { status: 401 })
    }

    // 5. Generate and store a One-Time Reset Token (Double-Lock Security)
    const resetToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 mins

    await admin.from("verification_codes").insert({
      email,
      code: resetToken,
      type: "reset_token",
      expires_at: expiresAt,
    })

    return NextResponse.json({ 
      success: true,
      resetToken, // Send this to the frontend for the secure jump
      message: "Identity verified! Redirecting to secure reset..."
    })

  } catch (error: any) {
    console.error("Verify OTP Reset Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred" },
      { status: 500 }
    )
  }
}
