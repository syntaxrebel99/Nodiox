import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createAdminClient } from "~/lib/supabase/admin"
import { EmailService } from "~/lib/email-service"
import { enforceAuthRateLimits, otpVerifyLimiters } from "~/lib/rate-limit"
import { z } from "zod"
import { validateCsrf, rotateCsrfToken } from "~/lib/csrf"
import { validatePasswordPolicy } from "~/lib/password-policy"
import { respondError, mapAuthErrorCode, normalizeFailureCode } from "~/lib/security-response"
import { logger } from "~/lib/logger"
import { getAuthTestSimulation } from "~/lib/test-simulation"
import { isCanonicalEmailIdentity, normalizeEmail } from "~/lib/normalize-email"

const RESET_COOKIE = "nodiox_reset_token"

const resetPasswordSchema = z.object({
  password: z.string().min(8),
}).strict()

interface ResetTokenRecord {
  id: string
  email: string
  recipient_email: string
  auth_user_id: string
}

function isResetTokenRecord(value: unknown): value is ResetTokenRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false
  }

  const record = value as Record<string, unknown>
  return (
    typeof record.id === "string" &&
    typeof record.email === "string" &&
    record.email.length > 0 &&
    isCanonicalEmailIdentity(record.email) &&
    typeof record.recipient_email === "string" &&
    record.recipient_email.trim().length > 0 &&
    typeof record.auth_user_id === "string" &&
    record.auth_user_id.length > 0
  )
}

function getProviderErrorCode(error: unknown): string | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code
  }

  return undefined
}

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

    const { password } = result.data

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

    // 3. Read the only reset credential accepted by the permanent flow.
    const admin = createAdminClient()
    const cookieStore = await cookies()
    const cookieToken = cookieStore.get(RESET_COOKIE)?.value
    if (!cookieToken) {
      return respondError(req, 401, "Your reset session has expired. Please start over.", {
        failureCode: "session_expired",
      })
    }

    // 4. Atomically consume the reset token. A failed password update requires
    // a fresh verification flow rather than leaving a reusable credential alive.
    const resetTokenHash = EmailService.hashResetTokenV1(cookieToken)
    const { data: tokenData, error: tokenError } = await admin
      .from("verification_codes")
      .delete()
      .match({
        type: "reset_token",
        code_hash: resetTokenHash,
        code_version: "reset_hmac_sha256_v1",
      })
      .gt("expires_at", new Date().toISOString())
      .select("id, email, recipient_email, auth_user_id")
      .maybeSingle()

    if (tokenError) {
      logger.error("reset_password_token_consume_failed", tokenError)
      return respondError(req, 500, "Unable to reset password. Please try again.", {
        failureCode: "provider_unavailable",
        provider: "supabase",
      })
    }

    if (!isResetTokenRecord(tokenData)) {
      return respondError(
        req,
        401,
        "Your reset session has expired. Please start over.",
        { failureCode: "session_expired" }
      )
    }

    // 5. Bind the consumed credential to the exact canonical Auth identity.
    const {
      data: { user },
      error: userError,
    } = await admin.auth.admin.getUserById(tokenData.auth_user_id)

    if (
      userError ||
      !user?.email ||
      user.email !== tokenData.email ||
      !isCanonicalEmailIdentity(user.email) ||
      normalizeEmail(user.email) !== tokenData.email
    ) {
      logger.warn("reset_password_token_identity_mismatch", {
        tokenId: tokenData.id,
        authUserId: tokenData.auth_user_id,
      })
      return respondError(req, 401, "Your reset session has expired. Please start over.", {
        failureCode: "session_expired",
      })
    }

    // 6. Update through the Admin API; no reset flow creates or relies on a session.
    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      password: password,
    })

    if (updateError) {
      logger.error("reset_password_update_failed", updateError)
      const providerCode = getProviderErrorCode(updateError)
      const publicError = mapAuthErrorCode(providerCode, updateError.message)
      return respondError(req, 400, publicError, {
        failureCode: normalizeFailureCode(providerCode, updateError.message),
        provider: "supabase",
      })
    }

    // 7. Delivery remains separate from the canonical identity. A notification
    // failure cannot turn an already-completed password update into a retryable
    // reset flow, so it is recorded for operational follow-up instead.
    const locale = cookieStore.get("NEXT_LOCALE")?.value || "en"
    try {
      await EmailService.sendPasswordChangedAlert(tokenData.recipient_email, locale)
    } catch (alertError) {
      logger.error("reset_password_alert_failed", alertError, {
        tokenId: tokenData.id,
        authUserId: user.id,
      })
    }

    // 8. CSRF Token Rotation on successful password change
    await rotateCsrfToken()

    const response = NextResponse.json({ success: true })
    if (cookieToken) response.cookies.delete(RESET_COOKIE)
    return response
  } catch (error: unknown) {
    logger.error("reset_password_error", error)
    return respondError(req, 500, "An unexpected error occurred. Please try again.", {
      failureCode: "unexpected_error",
    })
  }
}
