import { NextResponse, after } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { validatePasswordPolicy } from "~/lib/password-policy"
import { redisClient, hashIdentifier } from "~/lib/rate-limit"
import { respondError, mapAuthErrorCode, normalizeFailureCode } from "~/lib/security-response"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"
import {
  consumeVerifiedSignupPhone,
  SIGNUP_PHONE_VERIFICATION_COOKIE,
} from "~/lib/signup-phone-verification"
import { normalizePhoneNumber, validatePhoneNumber } from "~/lib/phone-validation"
import { parseSignupEmailVerificationRecord } from "~/lib/email-identity-state"

const setPasswordSchema = z.object({
  password: z.string().min(8),
  fullName: z.string().min(2),
  phone: z.string().refine((value) => validatePhoneNumber(value, "DZ"), {
    message: "Invalid phone number",
  }).optional(),
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

    const body = await req.json()
    const result = setPasswordSchema.safeParse(body)
    
    if (!result.success) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    const { password, fullName, phone: rawPhone } = result.data
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : undefined

    const policy = validatePasswordPolicy(password)
    if (!policy.ok) {
      return respondError(req, 400, "Password does not meet security requirements", {
        failureCode: "weak_password",
      })
    }

    // Strictly gated simulation hooks for automated testing.
    if (getAuthTestSimulation(req) === "supabase-down") {
      throw new Error("Supabase admin.createUser failed at postgresql://postgres:pw@db.supabase.co:5432/main")
    }

    // 1. Check for the Secure Signup Verification Cookie (opaque token)
    const cookieStore = await cookies()
    const signupToken = cookieStore.get("nodiox_signup_token")?.value

    const signupTokenHash = signupToken ? hashIdentifier("signup_token", signupToken) : null
    const signupEmailRecordRaw: unknown =
      signupTokenHash
        ? await redisClient.get<unknown>(`@nodiox/signup_token:${signupTokenHash}`)
        : null

    const signupEmailRecord = parseSignupEmailVerificationRecord(signupEmailRecordRaw)
    const verifiedEmail = signupEmailRecord?.canonicalEmail ?? null
    const recipientEmail = signupEmailRecord?.recipientEmail ?? null

    if (!verifiedEmail) {
      return respondError(req, 401, "Email verification expired or not found. Please restart signup.")
    }

    let verifiedPhone: string | null = null
    if (phone) {
      const signupPhoneToken = cookieStore.get(SIGNUP_PHONE_VERIFICATION_COOKIE)?.value
      verifiedPhone = signupPhoneToken
        ? await consumeVerifiedSignupPhone(signupPhoneToken)
        : null

      if (!verifiedPhone || verifiedPhone !== phone) {
        return respondError(req, 401, "Phone verification expired or not found. Please restart signup.")
      }
    }

    const admin = createAdminClient()
    const supabase = await createClient()

    // 2. Create or Update the User Record via Admin API
    // This allows us to mark them as 'email_confirm: true' immediately
    const { data: userData, error: createError } = await admin.auth.admin.createUser({
      email: verifiedEmail,
      password: password,
      email_confirm: true,
      phone: verifiedPhone ?? undefined,
      phone_confirm: !!verifiedPhone,
      user_metadata: {
        full_name: fullName,
        phone: verifiedPhone ?? phone,
      }
    })

    if (createError) {
      logger.error("signup_create_failed", createError)
      const publicError = mapAuthErrorCode((createError as any).code, createError.message)
      return respondError(req, 400, publicError, {
        failureCode: normalizeFailureCode((createError as any).code, createError.message),
        provider: "supabase",
        identifierHash: verifiedEmail ? hashIdentifier("email", verifiedEmail) : undefined,
      })
    }

    // 3. Clear the signup verification cookie + redis token
    const response = NextResponse.json({ success: true, user: userData.user })
    response.cookies.delete("nodiox_signup_token")
    if (verifiedPhone) {
      response.cookies.delete(SIGNUP_PHONE_VERIFICATION_COOKIE)
    }
    if (signupTokenHash) {
      await redisClient.del(`@nodiox/signup_token:${signupTokenHash}`)
    }

    // 4. Schedule Welcome Email (Non-blocking)
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"
    if (verifiedEmail) {
      after(async () => {
        try {
          await EmailService.sendWelcomeEmail(verifiedEmail, fullName, locale, {
            recipientEmail: recipientEmail ?? verifiedEmail,
          })
        } catch (err) {
          // Failure here doesn't block the response, but we log it via structured logger.
          logger.error("signup_welcome_email_failed", err)
        }
      })
    }

    // 5. Log the user in automatically (Bridge to Session)
    const { data: { properties }, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: verifiedEmail,
    })

    if (!linkError && properties?.email_otp) {
      await supabase.auth.verifyOtp({
        email: verifiedEmail,
        token: properties.email_otp,
        type: "magiclink",
      })
    }

    // 6. CSRF Token Rotation on successful setup
    await rotateCsrfToken()

    return response
  } catch (error: unknown) {
    logger.error("set_password_error", error)
    return respondError(req, 500, "An unexpected error occurred", {
      failureCode: "unexpected_error",
    })
  }
}
