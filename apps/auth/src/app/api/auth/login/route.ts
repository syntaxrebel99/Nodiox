import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createStatelessClient } from "~/lib/supabase/stateless"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, loginLimiters } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import { SmsService } from "~/lib/sms-service"
import {
  getLoginChallengeCookieOptions,
  invalidatePendingLoginChallenge,
  issuePendingLoginChallenge,
  LOGIN_CHALLENGE_COOKIE,
} from "~/lib/pending-login"

import { normalizeEmail, sanitizeEmail } from "~/lib/normalize-email"
import { normalizePhoneNumber, validatePhoneNumber } from "~/lib/phone-validation"

const emptyStringToUndefined = (value: unknown) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined
  }

  return value
}

const loginSchema = z.object({
  email: z.preprocess(emptyStringToUndefined, z.string().email().optional()),
  phone: z.preprocess(
    emptyStringToUndefined,
    z.string().refine((value) => validatePhoneNumber(value, "DZ"), {
      message: "Invalid phone number",
    }).optional()
  ),
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

    const { email: rawEmail, phone: rawPhone, password } = result.data
    const recipientEmail = rawEmail ? sanitizeEmail(rawEmail) : undefined
    const email = recipientEmail ? normalizeEmail(recipientEmail) : undefined
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : undefined

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

    const cookieStore = await cookies()
    const authClient = createStatelessClient()
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"

    // 3. Verify credentials without issuing the final session yet.
    const { data: signInData, error: signInError } = email
      ? await authClient.auth.signInWithPassword({ email, password })
      : await authClient.auth.signInWithPassword({ phone: phone!, password })

    if (signInError) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      )
    }

    // 4. If password is valid, send factor 2 and issue a short-lived login challenge.
    try {
      if (email) {
        await EmailService.sendOtp(email, "login_mfa", locale, {
          recipientEmail,
        })
      } else if (phone) {
        await SmsService.sendOtp(phone, "login_mfa", locale)
      }

      const staleChallengeToken = cookieStore.get(LOGIN_CHALLENGE_COOKIE)?.value
      if (staleChallengeToken) {
        await invalidatePendingLoginChallenge(staleChallengeToken)
      }

      const challengeToken = await issuePendingLoginChallenge({
        method: email ? "email" : "phone",
        accessToken: signInData.session?.access_token,
        email: email ?? signInData.user?.email ?? undefined,
        phone,
        refreshToken: signInData.session?.refresh_token,
      })

      const newToken = await rotateCsrfToken()
      const response = NextResponse.json({
        success: true,
        mfaRequired: true,
        factorType: email ? "email" : "sms",
      })

      response.cookies.set(LOGIN_CHALLENGE_COOKIE, challengeToken, getLoginChallengeCookieOptions())
      response.headers.set("x-csrf-token", newToken)
      return response
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to send verification code"
      console.error("Login MFA Send Error:", error)
      return NextResponse.json(
        { error: message },
        { status: 500 }
      )
    }
  } catch (error: unknown) {
    console.error("Login Error:", error)
    return respondError(req, 500, "An unexpected error occurred")
  }
}
