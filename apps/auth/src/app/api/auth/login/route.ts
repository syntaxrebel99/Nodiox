import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createStatelessClient } from "~/lib/supabase/stateless"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, loginLimiters, hashIdentifier } from "~/lib/rate-limit"
import { emailRateLimitIdentifier, phoneRateLimitIdentifier } from "~/lib/auth-rate-limit-identifier"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { respondError } from "~/lib/security-response"
import { SmsService } from "~/lib/sms-service"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"
import {
  getLoginChallengeCookieOptions,
  invalidatePendingLoginChallenge,
  issuePendingLoginChallenge,
  LOGIN_CHALLENGE_COOKIE,
} from "~/lib/pending-login"

import {
  isCanonicalEmailIdentity,
  normalizeEmail,
  resolveEmailIdentity,
} from "~/lib/normalize-email"
import { normalizePhoneNumber, validatePhoneNumber } from "~/lib/phone-validation"
import { findAuthUserByPhone } from "~/lib/auth-user-lookup"

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
}).refine(data => Boolean(data.email) !== Boolean(data.phone), {
  message: "Provide exactly one email or phone identifier",
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

    // 1. Validate Request Body
    const body = await req.json()
    const result = loginSchema.safeParse(body)
    
    if (!result.success) {
      return respondError(req, 400, "Invalid request format", {
        failureCode: "validation_failed",
      })
    }

    const { email: rawEmail, phone: rawPhone, password } = result.data
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
        limiters: loginLimiters,
        req,
        identifier: email
          ? emailRateLimitIdentifier(email)
          : phoneRateLimitIdentifier(phone!),
        namespace: "login"
      });
    } catch {
      return respondError(req, 429, "Too many attempts. Please try again later.", {
        failureCode: "rate_limit_exceeded",
      })
    }

    // Strictly gated simulation hooks for automated testing.
    const simulation = getAuthTestSimulation(req)
    if (simulation === "supabase-down") {
      throw new Error("Supabase Postgres connection failed at postgresql://postgres:pw@db.supabase.co:5432/main for user user@example.com")
    }
    if (simulation === "notification-down") {
      throw new Error("Resend API rejected delivery to user@example.com with api_key=re_123456789")
    }

    const cookieStore = await cookies()
    const authClient = createStatelessClient()
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"

    let resolvedEmail = email

    if (!resolvedEmail && phone) {
      // Nodiox verifies phones with Infobip directly, so the underlying
      // Supabase password identity is still the user's email-based account.
      const authUser = await findAuthUserByPhone(phone)
      if (!authUser?.email) {
        return respondError(req, 401, "Invalid credentials", {
          failureCode: "invalid_credentials",
        })
      }

      resolvedEmail = normalizeEmail(authUser.email)
      if (!isCanonicalEmailIdentity(resolvedEmail)) {
        return respondError(req, 401, "Invalid credentials", {
          failureCode: "invalid_credentials",
        })
      }
    }

    if (!resolvedEmail) {
      return respondError(req, 401, "Invalid credentials", {
        failureCode: "invalid_credentials",
      })
    }

    // 3. Verify credentials without issuing the final session yet.
    const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({
      email: resolvedEmail,
      password,
    })

    if (signInError) {
      return respondError(req, 401, "Invalid credentials", {
        failureCode: "invalid_credentials",
        provider: "supabase",
      })
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

      const accessToken = signInData.session?.access_token
      const refreshToken = signInData.session?.refresh_token
      if (!accessToken || !refreshToken) {
        throw new Error("Supabase did not return a session for the pending login challenge")
      }

      const challengeToken = email
          ? await issuePendingLoginChallenge({
            method: "email",
            canonicalEmail: resolvedEmail,
            recipientEmail: recipientEmail ?? resolvedEmail,
            accessToken,
            refreshToken,
          })
        : await issuePendingLoginChallenge({
            method: "phone",
            phone: phone!,
            accessToken,
            refreshToken,
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
      logger.error("login_mfa_send_failed", error)
      return respondError(req, 500, "Failed to send verification code", {
        failureCode: "mfa_send_failed",
        provider: email ? "resend" : "infobip",
        identifierHash: email ? hashIdentifier("email", email) : phone ? hashIdentifier("phone", phone) : undefined,
      })
    }
  } catch (error: unknown) {
    logger.error("login_error", error)
    return respondError(req, 500, "An unexpected error occurred", {
      failureCode: "unexpected_error",
    })
  }
}
