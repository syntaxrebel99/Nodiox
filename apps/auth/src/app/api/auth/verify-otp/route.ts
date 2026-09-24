import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "~/lib/supabase/server"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, otpVerifyLimiters } from "~/lib/rate-limit"
import { emailRateLimitIdentifier, phoneRateLimitIdentifier } from "~/lib/auth-rate-limit-identifier"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { redisClient, hashIdentifier } from "~/lib/rate-limit"
import { respondError } from "~/lib/security-response"
import { SmsService } from "~/lib/sms-service"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"
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
import { createSignupEmailVerificationRecord } from "~/lib/email-identity-state"
import { isCanonicalEmailIdentity, resolveEmailIdentity } from "~/lib/normalize-email"
import { normalizePhoneNumber, validatePhoneNumber } from "~/lib/phone-validation"

const verifyOtpSchema = z.object({
  email: z.string().email().optional(),
  phone: z.string().refine((value) => validatePhoneNumber(value, "DZ"), {
    message: "Invalid phone number",
  }).optional(),
  token: z.string().min(6),
  type: z.enum(["signup", "sms", "email"]),
  flow: z.enum(["login", "signup"]).optional(),
}).refine(data => Boolean(data.email) !== Boolean(data.phone), {
  message: "Provide exactly one email or phone identifier",
})

export async function POST(req: Request) {
  try {
    // 0. CSRF Validation
    const csrfResult = await validateCsrf(req)
    if (!csrfResult.success) {
      return respondError(req, 403, csrfResult.error || "Forbidden")
    }

    // 1. Validate Body First (so we can extract identifiers for limits)
    const body = await req.json()
    const result = verifyOtpSchema.safeParse(body)
    
    if (!result.success) {
      return respondError(req, 400, "Invalid request format")
    }

    const { email: rawEmail, phone: rawPhone, token, type, flow } = result.data
    const emailIdentity = rawEmail ? resolveEmailIdentity(rawEmail) : undefined
    const recipientEmail = emailIdentity?.recipientEmail
    const email = emailIdentity?.canonicalEmail
    const phone = rawPhone ? normalizePhoneNumber(rawPhone) : undefined

    if (email && !isCanonicalEmailIdentity(email)) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    // 2. Execute Tri-Layer Rate Limiting (IP + ID, Bounded Tarpit)
    try {
      await enforceAuthRateLimits({
        limiters: otpVerifyLimiters,
        req,
        identifier: email
          ? emailRateLimitIdentifier(email)
          : phoneRateLimitIdentifier(phone!),
        namespace: "otp_verify"
      });
    } catch {
      return respondError(req, 429, "Too many attempts. Please try again later.", {
        failureCode: "rate_limit_exceeded",
      })
    }

    // Strictly gated simulation hooks for automated testing.
    if (getAuthTestSimulation(req) === "supabase-down") {
      throw new Error("Supabase auth.setSession failed at postgresql://postgres:pw@db.supabase.co:5432/main")
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
        return {
          error: "Failed to establish secure session. Please try again.",
          user: null,
        }
      }

      return { error: null, user: sessionData.user }
    }

    // 4. Handle Email OTP (Resend Engine)
    if (type === "email" || type === "signup") {
      if (!email) return respondError(req, 400, "Email is required")

      if (
        type === "email" &&
        (!pendingLogin ||
          pendingLogin.method !== "email" ||
          pendingLogin.canonicalEmail !== email)
      ) {
        return respondError(
          req,
          401,
          "Your login verification session has expired. Please log in again."
        )
      }

      // a) Verify our custom OTP from the DB (using the corresponding type)
      const otpType = type === "signup" ? "signup" : "login_mfa"
      const { success: isVerified, error: verifyError } = await EmailService.verifyOtp(email, token, otpType)

      if (!isVerified) {
        return respondError(
          req,
          401,
          verifyError || "Invalid or expired verification code"
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
          JSON.stringify(createSignupEmailVerificationRecord(
            email,
            recipientEmail ?? email,
          )),
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
        return respondError(req, 500, "Failed to establish secure session. Please try again.", {
          failureCode: "mfa_session_failed",
          provider: "supabase",
        })
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
      return respondError(
        req,
        401,
        "Your login verification session has expired. Please log in again.",
        { failureCode: "session_expired" }
      )
    }

    if (!phone) {
      return respondError(req, 400, "Phone is required", { failureCode: "validation_failed" })
    }

    if (flow === "signup") {
      const { success: isVerified, error: verifyError } = await SmsService.verifyOtp(phone, token, "signup")
      if (!isVerified) {
        return respondError(
          req,
          401,
          verifyError || "Invalid or expired verification code",
          { failureCode: "otp_invalid", provider: "infobip" }
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
      return respondError(req, 400, "Phone verification flow is required", { failureCode: "validation_failed" })
    }

    const { success: isVerified, error: verifyError } = await SmsService.verifyOtp(phone, token, "login_mfa")
    if (!isVerified) {
      return respondError(
        req,
        401,
        verifyError || "Invalid or expired verification code",
        { failureCode: "otp_invalid", provider: "infobip" }
      )
    }

    const { error: sessionError, user } = await establishSessionFromPendingLogin()
    if (sessionError || !user) {
      return respondError(req, 500, "Failed to establish secure session. Please try again.", {
        failureCode: "mfa_session_failed",
        provider: "supabase",
      })
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
    logger.error("verify_otp_error", error)
    return respondError(req, 500, "An unexpected error occurred", {
      failureCode: "unexpected_error",
    })
  }
}
