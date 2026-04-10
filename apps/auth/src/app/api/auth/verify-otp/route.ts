import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, otpVerifyLimiters } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { redisClient, hashIdentifier } from "~/lib/rate-limit"
import { respondError } from "~/lib/security-response"
import { SmsService } from "~/lib/sms-service"
import {
  consumePendingLoginChallenge,
  getPendingLoginChallenge,
  LOGIN_CHALLENGE_COOKIE,
} from "~/lib/pending-login"
import {
  getSignupPhoneCookieOptions,
  issueVerifiedSignupPhoneToken,
  SIGNUP_PHONE_VERIFICATION_COOKIE,
} from "~/lib/signup-phone-verification"

import { normalizeEmail, sanitizeEmail } from "~/lib/normalize-email"
import { normalizePhoneNumber, validatePhoneNumber } from "~/lib/phone-validation"

interface SignupEmailVerificationRecord {
  canonicalEmail: string
  recipientEmail: string
}

const verifyOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().refine((value) => validatePhoneNumber(value, "DZ"), {
    message: "Invalid phone number",
  }).optional(),
  token: z.string().min(6),
  type: z.enum(["signup", "sms", "email"]),
  flow: z.enum(["login", "signup"]).optional(),
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

    // 1. Validate Body First (so we can extract identifiers for limits)
    const body = await req.json()
    const result = verifyOtpSchema.safeParse(body)
    
    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid request format", details: result.error.issues },
        { status: 400 }
      )
    }

    const { email: rawEmail, phone: rawPhone, token, type, flow } = result.data
    const recipientEmail = rawEmail ? sanitizeEmail(rawEmail) : undefined
    const email = recipientEmail ? normalizeEmail(recipientEmail) : undefined
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : undefined

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: otpVerifyLimiters,
        req,
        identifier: email || phone,
        namespace: "otp_verify"
      });
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 429 })
    }

    const cookieStore = await cookies()
    const challengeToken = cookieStore.get(LOGIN_CHALLENGE_COOKIE)?.value
    const pendingLogin = challengeToken
      ? await getPendingLoginChallenge(challengeToken)
      : null

    // 3. Init Supabase Clients
    const supabase = await createClient()

    const establishSessionFromPendingLogin = async () => {
      if (!pendingLogin?.accessToken || !pendingLogin?.refreshToken) {
        return { error: "Failed to establish secure session. Please try again.", user: null }
      }

      const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
        access_token: pendingLogin.accessToken,
        refresh_token: pendingLogin.refreshToken,
      })

      if (sessionError) {
        return { error: sessionError.message, user: null }
      }

      return { error: null, user: sessionData.user }
    }

    // 4. Handle Email OTP (Resend Engine)
    if (type === "email" || type === "signup") {
      if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 })

      if (
        type === "email" &&
        (!pendingLogin ||
          pendingLogin.method !== "email" ||
          pendingLogin.email !== email)
      ) {
        return NextResponse.json(
          { error: "Your login verification session has expired. Please log in again." },
          { status: 401 }
        )
      }

      // a) Verify our custom OTP from the DB (using the corresponding type)
      const otpType = type === "signup" ? "signup" : "login_mfa"
      const { success: isVerified, error: verifyError } = await EmailService.verifyOtp(email, token, otpType)

      if (!isVerified) {
        return NextResponse.json(
          { error: verifyError || "Invalid or expired verification code" },
          { status: 401 }
        )
      }

      // b) If Verified -> Establish Session or Verification State
      if (type === "signup") {
        // For signup, we don't have a user yet. We set a secure cookie to authorize the 'set-password' step.
        const response = NextResponse.json({ success: true, message: "Email verified. Please set your password." })

        // Use an opaque, short-lived token (no PII in cookie). Email is stored server-side in Redis for 15m.
        const signupToken = crypto.randomUUID()
        const signupTokenHash = hashIdentifier("signup_token", signupToken)
        await redisClient.set(
          `@nodiox/signup_token:${signupTokenHash}`,
          {
            canonicalEmail: email,
            recipientEmail: recipientEmail ?? email,
          } satisfies SignupEmailVerificationRecord,
          { ex: 60 * 15 }
        )

        response.cookies.set("nodiox_signup_token", signupToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          maxAge: 900, // 15 minutes
          path: "/",
        })
        
        // CSRF Token Rotation on successful signup verification
        const newCsrf = await rotateCsrfToken()
        response.headers.set("x-csrf-token", newCsrf)
        
        return response
      }

      // c) For Login MFA -> restore the pending password-authenticated session
      const { error: sessionError, user } = await establishSessionFromPendingLogin()
      if (sessionError || !user) {
        return NextResponse.json({ error: sessionError || "Failed to establish secure session. Please try again." }, { status: 500 })
      }

      // CSRF Token Rotation on successful MFA login
      const newCsrf = await rotateCsrfToken()
      const response = NextResponse.json({ success: true, user })
      if (challengeToken) {
        await consumePendingLoginChallenge(challengeToken)
        response.cookies.delete(LOGIN_CHALLENGE_COOKIE)
      }
      response.headers.set("x-csrf-token", newCsrf)
      return response
    }

    // 5. Handle Phone OTP (Existing Supabase Flow)
    if (
      flow === "login" &&
      (!pendingLogin ||
        pendingLogin.method !== "phone" ||
        pendingLogin.phone !== phone)
    ) {
      return NextResponse.json(
        { error: "Your login verification session has expired. Please log in again." },
        { status: 401 }
      )
    }

    if (!phone) {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 })
    }

    if (flow === "signup") {
      const { success: isVerified, error: verifyError } = await SmsService.verifyOtp(phone, token, "signup")
      if (!isVerified) {
        return NextResponse.json(
          { error: verifyError || "Invalid or expired verification code" },
          { status: 401 }
        )
      }

      const phoneToken = await issueVerifiedSignupPhoneToken(phone)
      const newCsrf = await rotateCsrfToken()
      const response = NextResponse.json({ success: true, message: "Phone verified. Please continue." })
      response.cookies.set(
        SIGNUP_PHONE_VERIFICATION_COOKIE,
        phoneToken,
        getSignupPhoneCookieOptions()
      )
      response.headers.set("x-csrf-token", newCsrf)
      return response
    }

    if (flow !== "login") {
      return NextResponse.json({ error: "Phone verification flow is required" }, { status: 400 })
    }

    const { success: isVerified, error: verifyError } = await SmsService.verifyOtp(phone, token, "login_mfa")
    if (!isVerified) {
      return NextResponse.json(
        { error: verifyError || "Invalid or expired verification code" },
        { status: 401 }
      )
    }

    const { error: sessionError, user } = await establishSessionFromPendingLogin()
    if (sessionError || !user) {
      return NextResponse.json(
        { error: sessionError || "Failed to establish secure session. Please try again." },
        { status: 500 }
      )
    }

    // CSRF Token Rotation on successful OTP verification (Phone flow)
    const newCsrf = await rotateCsrfToken()

    const response = NextResponse.json({ success: true, user })
    if (flow === "login" && challengeToken) {
      await consumePendingLoginChallenge(challengeToken)
      response.cookies.delete(LOGIN_CHALLENGE_COOKIE)
    }
    response.headers.set("x-csrf-token", newCsrf)
    return response
  } catch (error: unknown) {
    console.error("Verify OTP Error:", error)
    return respondError(req, 500, "An unexpected error occurred")
  }
}
