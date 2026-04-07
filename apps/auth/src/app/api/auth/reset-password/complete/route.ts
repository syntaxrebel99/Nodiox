import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { otpRateLimit } from "~/lib/rate-limit"
import { z } from "zod"

const resetPasswordSchema = z.object({
  code: z.string().optional(),
  password: z.string().min(8),
})

export async function POST(req: Request) {
  try {
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
    const result = resetPasswordSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid password format", details: result.error.issues },
        { status: 400 }
      )
    }

    const { code, password } = result.data

    // 3. Init Clients
    const supabase = await createClient()
    const admin = createAdminClient()
    const cookieStore = await cookies()
    let isTokenValidated = false

    // 4. SECURITY HANDSHAKE (Double-Lock)
    // If a 'code' is provided, it could be a legacy Supabase link or our new secure resetToken.
    if (code) {
      // A. Check if it's our custom secure reset_token (OTP Flow)
      const { data: tokenData } = await admin
        .from("verification_codes")
        .select("*")
        .match({ code, type: "reset_token" })
        .single()

      if (tokenData) {
        if (new Date(tokenData.expires_at) > new Date()) {
          isTokenValidated = true
        } else {
          // Cleanup expired token
          await admin.from("verification_codes").delete().eq("id", tokenData.id)
          return NextResponse.json({ error: "Your reset token has expired. Please try again." }, { status: 401 })
        }
      }

      // B. If not our token, try Supabase's built-in code exchange (Link/Recovery Flow)
      if (!isTokenValidated) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)
        if (exchangeError) {
          return NextResponse.json(
            { error: "This secure link has expired or is invalid. Please request a new one." },
            { status: 401 }
          )
        }
      }
    }

    // 5. Verify Active Identity
    // MUST have an active user session established via either the bridge or the code exchange.
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Your verification session has expired. Please start over." },
        { status: 401 }
      )
    }

    // 6. Securely Update Password
    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    })

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      )
    }

    // 7. Cleanup the Reset Token if it was used
    if (isTokenValidated && code) {
      await admin.from("verification_codes").delete().match({ code, type: "reset_token" })
    }


    // 6. Security Alert: Notify the user that their password was changed
    if (user.email) {
      // Get Locale from Cookie (NEXT_LOCALE)
      const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"
      // We await this to maintain request context for getTranslations
      await EmailService.sendPasswordChangedAlert(user.email, locale)
    }

    // 7. Sign out the session used for reset to force a fresh login
    await supabase.auth.signOut()

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("Reset Password Session Error:", error)
    return NextResponse.json(
      { error: "An unexpected error occurred. Please try again." },
      { status: 500 }
    )
  }
}
