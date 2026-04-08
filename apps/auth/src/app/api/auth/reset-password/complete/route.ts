import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, otpVerifyLimiters } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { validatePasswordPolicy } from "~/lib/password-policy"
import { respondError } from "~/lib/security-response"

const RESET_COOKIE = "nodiox_reset_token"

const resetPasswordSchema = z.object({
  code: z.string().optional(),
  password: z.string().min(8),
})

export async function POST(req: Request) {
  try {
    // 0. CSRF Validation
    const csrfResult = await validateCsrf(req)
    if (!csrfResult.success) {
      return NextResponse.json({ error: csrfResult.error }, { status: 403 })
    }

    // 1. Validate Body First (so we know target email if we have it logically mapped, wait, reset password only takes token and password...)
    const body = await req.json()
    const result = resetPasswordSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request format", details: result.error.issues },
        { status: 400 }
      )
    }

    const { code, password } = result.data

    const policy = validatePasswordPolicy(password)
    if (!policy.ok) {
      return NextResponse.json(
        { error: "Password does not meet security requirements", code: policy.error },
        { status: 400 }
      )
    }

    // 2. Execute Rate Limiting (IP purely since email identifier isn't in payload yet)
    try {
      await enforceAuthRateLimits({
        limiters: otpVerifyLimiters,
        req,
        namespace: "reset_password"
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 429 })
    }

    // 3. Init Clients
    const supabase = await createClient()
    const admin = createAdminClient()
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get(RESET_COOKIE)?.value
    const effectiveCode = code ?? cookieToken
    let isTokenValidated = false

    // 4. SECURITY HANDSHAKE (Double-Lock)
    // If a 'code' is provided, it could be a legacy Supabase link or our new secure resetToken.
    if (effectiveCode) {
      // A. Check if it's our custom secure reset_token (OTP Flow)
      const resetTokenHash = EmailService.hashResetTokenV1(effectiveCode)
      const { data: tokenData } = await admin
        .from("verification_codes")
        .select("*")
        // Prefer modern hashed token lookup
        .match({ type: "reset_token", code_hash: resetTokenHash })
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

      // Backward compatibility: legacy reset tokens stored in plaintext `code`
      if (!isTokenValidated) {
        const { data: legacyTokenData } = await admin
          .from("verification_codes")
          .select("*")
          .match({ code: effectiveCode, type: "reset_token" })
          .single()

        if (legacyTokenData) {
          if (new Date(legacyTokenData.expires_at) > new Date()) {
            isTokenValidated = true
          } else {
            await admin.from("verification_codes").delete().eq("id", legacyTokenData.id)
            return NextResponse.json({ error: "Your reset token has expired. Please try again." }, { status: 401 })
          }
        }
      }

      // B. If not our token, try Supabase's built-in code exchange (Link/Recovery Flow)
      if (!isTokenValidated) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(effectiveCode)
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
    if (isTokenValidated && effectiveCode) {
      const resetTokenHash = EmailService.hashResetTokenV1(effectiveCode)
      // Delete both modern + legacy forms.
      await admin.from("verification_codes").delete().match({ type: "reset_token", code_hash: resetTokenHash })
      await admin.from("verification_codes").delete().match({ code: effectiveCode, type: "reset_token" })
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

    // 8. CSRF Token Rotation on successful password change
    await rotateCsrfToken()

    const response = NextResponse.json({ success: true })
    if (cookieToken) response.cookies.delete(RESET_COOKIE)
    return response
  } catch (error: any) {
    console.error("Reset Password Session Error:", error)
    return respondError(req, 500, "An unexpected error occurred. Please try again.")
  }
}
