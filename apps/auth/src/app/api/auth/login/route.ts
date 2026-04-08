import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createStatelessClient } from "~/lib/supabase/stateless"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, loginLimiters } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import {
  getLoginChallengeCookieOptions,
  invalidatePendingLoginChallenge,
  issuePendingLoginChallenge,
  LOGIN_CHALLENGE_COOKIE,
} from "~/lib/pending-login"

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

    const { email: rawEmail, phone, password } = result.data
    const email = rawEmail ? normalizeEmail(rawEmail) : undefined

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

    // 3. Verify credentials without issuing the final session yet.
    const { error: signInError } = email
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
        const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"
        await EmailService.sendOtp(email, "login_mfa", locale)
      } else if (phone) {
        const { error: otpError } = await authClient.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: false },
        })
        if (otpError) throw otpError
      }

      const staleChallengeToken = cookieStore.get(LOGIN_CHALLENGE_COOKIE)?.value
      if (staleChallengeToken) {
        await invalidatePendingLoginChallenge(staleChallengeToken)
      }

      const challengeToken = await issuePendingLoginChallenge({
        method: email ? "email" : "phone",
        email,
        phone,
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
