import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, otpVerifyLimiters } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { validatePasswordPolicy } from "~/lib/password-policy"
import { respondError, mapAuthErrorCode, normalizeFailureCode } from "~/lib/security-response"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"

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
      return respondError(req, 403, csrfResult.error || "Forbidden", {
        failureCode: "csrf_rejected",
      })
    }

    // 1. Validate Body First
    const body = await req.json()
    const result = resetPasswordSchema.safeParse(body)
    
    if (!result.success) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    const { code, password } = result.data

    const policy = validatePasswordPolicy(password)
    if (!policy.ok) {
      return respondError(req, 400, "Password does not meet security requirements", {
        failureCode: "weak_password",
      })
    }

    // 2. Execute Rate Limiting (IP purely since email identifier isn't in payload yet)
    try {
      await enforceAuthRateLimits({
        limiters: otpVerifyLimiters,
        req,
        namespace: "reset_password"
      });
    } catch {
      return respondError(req, 429, "Too many attempts. Please try again later.", {
        failureCode: "rate_limit_exceeded",
      })
    }

    // Strictly gated simulation hooks for automated testing.
    if (getAuthTestSimulation(req) === "supabase-down") {
      throw new Error("Supabase auth.updateUser failed at postgresql://postgres:pw@db.supabase.co:5432/main")
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
          return respondError(req, 401, "Your reset token has expired. Please try again.")
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
            return respondError(req, 401, "Your reset token has expired. Please try again.")
          }
        }
      }

      // B. If not our token, try Supabase's built-in code exchange (Link/Recovery Flow)
      if (!isTokenValidated) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(effectiveCode)
        if (exchangeError) {
          return respondError(
            req,
            401,
            "This secure link has expired or is invalid. Please request a new one."
          )
        }
      }
    }

    // 5. Verify Active Identity
    // MUST have an active user session established via either the bridge or the code exchange.
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return respondError(
        req,
        401,
        "Your verification session has expired. Please start over."
      )
    }

    // 6. Securely Update Password
    const { error: updateError } = await supabase.auth.updateUser({
      password: password,
    })

    if (updateError) {
      logger.error("reset_password_update_failed", updateError)
      const publicError = mapAuthErrorCode((updateError as any).code, updateError.message)
      return respondError(req, 400, publicError, {
        failureCode: normalizeFailureCode((updateError as any).code, updateError.message),
        provider: "supabase",
      })
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
  } catch (error: unknown) {
    logger.error("reset_password_session_error", error)
    return respondError(req, 500, "An unexpected error occurred. Please try again.", {
      failureCode: "unexpected_error",
    })
  }
}
